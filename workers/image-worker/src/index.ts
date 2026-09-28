// workers/image-worker entrypoint — consumes generation Takes from the MOS queue.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_TOKEN, MEDIA_* (bucket),
//      RUNWAY_API_KEY / OPENAI_API_KEY (optional; providers without keys stay "not connected").
import { createClient } from "@supabase/supabase-js";
// Provider Gateway + media storage live in apps/api (canonical, rule 7); the worker only uses them.
import { getAdapter } from "@aurastage/api/dist/providers";
import { getMedia, putMedia, takeStorageKey } from "@aurastage/api/dist/storage/media";
import { runOnce, type Claim } from "./worker";

const env = process.env;
for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "WORKER_TOKEN"]) if (!env[k]) throw new Error(`missing env ${k}`);
const db = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const token = env.WORKER_TOKEN!;
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const deps = {
  claim: () => rpc<Claim | null>("worker_claim_take", { p_token: token }),
  complete: (id: string, key: string, mt: string, req: string | null, cost: number | null) =>
    rpc<void>("worker_complete_take", { p_token: token, p_take_id: id, p_storage_key: key, p_media_type: mt, p_provider_request_id: req, p_cost: cost }),
  fail: (id: string, error: string, req: string | null) => rpc<void>("worker_fail_take", { p_token: token, p_take_id: id, p_error: error, p_provider_request_id: req }),
  gateway: { getAdapter },
  storage: { put: (k: string, b: Uint8Array, ct: string) => putMedia(k, b, ct), get: (k: string) => getMedia(k), keyFor: takeStorageKey },
  env,
  log,
};

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

(async () => {
  log("worker.started", { providers: ["aurastage-sketch", env.RUNWAY_API_KEY ? "runway" : null, env.OPENAI_API_KEY ? "openai" : null].filter(Boolean) });
  while (!stopping) {
    try {
      const worked = await runOnce(deps);
      if (!worked) await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      log("worker.error", { error: (e as Error).message });
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  log("worker.stopped", {});
})();
