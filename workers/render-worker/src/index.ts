// workers/render-worker entrypoint — consumes renders from the MOS queue (Railway service "render-worker").
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_TOKEN (its SHA-256 is in worker_credentials), MEDIA_* (bucket).
import { createClient } from "@supabase/supabase-js";
import { retryOnTimeout } from "@aurastage/api/dist/infrastructure/dbRetry";
// Media storage lives in apps/api (canonical); the worker only uses it.
import { getMedia, putMediaFile, renderStorageKey } from "@aurastage/api/dist/storage/media";
import { ffmpeg } from "./ffmpeg";
import { runOnce, type WorkerDeps } from "./worker";
import { runVideoEditOnce, type VideoEditDeps } from "./videoEdit";

const env = process.env;
for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "WORKER_TOKEN", "MEDIA_BUCKET"]) if (!env[k]) throw new Error(`missing env ${k}`);
const db = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const token = env.WORKER_TOKEN!;
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  // A call the database cancelled for taking too long was rolled back: run it once more (BUILD_PLAN item 50).
  const { data, error } = await retryOnTimeout(() => db.rpc(fn, args));
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const deps: WorkerDeps = {
  claim: () => rpc("worker_claim_render", { p_token: token }),
  progress: (id, pct, stage) => rpc<boolean>("worker_render_progress", { p_token: token, p_render_id: id, p_progress: pct, p_stage: stage }),
  complete: (id, outputs, qc, passed) => rpc("worker_complete_render", { p_token: token, p_render_id: id, p_outputs: outputs, p_qc: qc, p_qc_passed: passed }),
  fail: (id, error) => rpc("worker_fail_render", { p_token: token, p_render_id: id, p_error: error }),
  fetchMedia: (key) => getMedia(key),
  putFile: (key, path, type) => putMediaFile(key, path, type),
  keyFor: (r, name) => renderStorageKey(r, name),
  log,
};

// Video edits from the Assets Library (migration 0050) share this worker's ffmpeg and media access.
const editDeps: VideoEditDeps = {
  claimEdit: () => rpc("worker_claim_video_edit", { p_token: token }),
  completeEdit: (id, path, checksum, metadata) => rpc("worker_complete_video_edit", { p_token: token, p_id: id, p_storage_path: path, p_checksum: checksum, p_metadata: metadata }),
  failEdit: (id, error) => rpc("worker_fail_video_edit", { p_token: token, p_id: id, p_error: error }),
  fetchMedia: (key) => getMedia(key),
  putFile: (key, path, type) => putMediaFile(key, path, type),
  log,
};

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

(async () => {
  const { stdout } = await ffmpeg(["-version"]);
  log("worker.started", { ffmpeg: stdout.toString().split("\n")[0] });
  // Idle back-off (2026-10-02): an idle worker waits longer each time it finds nothing (3 s → 15 s), so it barely touches
  // the database; it is back to full speed the moment a render or video edit is queued.
  let idle = 0;
  while (!stopping) {
    try {
      const worked = (await runOnce(deps)) || (await runVideoEditOnce(editDeps));
      if (worked) idle = 0;
      else await new Promise((r) => setTimeout(r, Math.min(15000, 3000 * 2 ** Math.min(idle++, 4)) + Math.floor(Math.random() * 400)));
    } catch (e) {
      log("worker.error", { error: (e as Error).message });
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  log("worker.stopped", {});
})();
