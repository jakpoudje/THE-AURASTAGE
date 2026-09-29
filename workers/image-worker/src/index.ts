// workers/image-worker entrypoint — consumes generation Takes from the MOS queue.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_TOKEN, MEDIA_* (bucket),
//      RUNWAY_API_KEY / OPENAI_API_KEY (optional; providers without keys stay "not connected"),
//      ANTHROPIC_API_KEY (optional; Ask AuraStage plans with the labelled test planner until it is set,
//      unless AURA_TEST_PROVIDER=off).
import { createClient } from "@supabase/supabase-js";
// Provider Gateway + media storage live in apps/api (canonical, rule 7); the worker only uses them.
import { getAdapter, getAudioAdapter, reasoningProvider } from "@aurastage/api/dist/providers";
import { getMedia, putMedia, takeStorageKey } from "@aurastage/api/dist/storage/media";
import { runOnce, type Claim } from "./worker";
import { planOnce, type PlanClaim } from "./planner";
import { audioOnce, type AudioClaim } from "./audio";
import { refOnce, type RefClaim } from "./refs";
import { writingOnce, type WritingClaim } from "./writing";
import { runWritingJob } from "@aurastage/api/dist/modules/screenplay/screenplay.writingJob";

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

const plannerDeps = {
  claim: () => rpc<PlanClaim | null>("worker_claim_ai_proposal", { p_token: token }),
  complete: (id: string, plan: unknown, provider: string, model: string, test: boolean, req: string | null) =>
    rpc<void>("worker_complete_ai_proposal", { p_token: token, p_id: id, p_plan: plan, p_provider: provider, p_model: model, p_test_output: test, p_request_id: req, p_cost: null }),
  fail: (id: string, error: string) => rpc<void>("worker_fail_ai_proposal", { p_token: token, p_id: id, p_error: error }),
  reasoner: () => reasoningProvider(env, { allowTest: env.AURA_TEST_PROVIDER !== "off" }),
  env,
  log,
};

const audioDeps = {
  claim: () => rpc<AudioClaim | null>("worker_claim_audio_generation", { p_token: token }),
  complete: (id: string, key: string, checksum: string, metadata: Record<string, unknown>, result: Record<string, unknown>, req: string | null, cost: number | null) =>
    rpc<string>("worker_complete_audio_generation", { p_token: token, p_id: id, p_storage_key: key, p_checksum: checksum, p_metadata: metadata, p_result: result, p_request_id: req, p_cost: cost }),
  fail: (id: string, error: string, req: string | null) => rpc<void>("worker_fail_audio_generation", { p_token: token, p_id: id, p_error: error, p_request_id: req }),
  getAudioAdapter,
  put: (k: string, b: Uint8Array, ct: string) => putMedia(k, b, ct),
  env,
  log,
};

const refDeps = {
  claim: () => rpc<RefClaim | null>("worker_claim_character_reference", { p_token: token }),
  complete: (id: string, key: string, checksum: string, metadata: Record<string, unknown>, req: string | null, cost: number | null) =>
    rpc<string>("worker_complete_character_reference", { p_token: token, p_id: id, p_storage_key: key, p_checksum: checksum, p_metadata: metadata, p_request_id: req, p_cost: cost }),
  fail: (id: string, error: string, req: string | null) => rpc<void>("worker_fail_character_reference", { p_token: token, p_id: id, p_error: error, p_request_id: req }),
  getAdapter,
  put: (k: string, b: Uint8Array, ct: string) => putMedia(k, b, ct),
  env,
  log,
};
// Location & prop reference views (migration 0028): same loop, their own queue.
const worldRefDeps = {
  claim: () => rpc<RefClaim | null>("worker_claim_world_reference", { p_token: token }),
  complete: (id: string, key: string, checksum: string, metadata: Record<string, unknown>, req: string | null, cost: number | null) =>
    rpc<string>("worker_complete_world_reference", { p_token: token, p_id: id, p_storage_key: key, p_checksum: checksum, p_metadata: metadata, p_request_id: req, p_cost: cost }),
  fail: (id: string, error: string, req: string | null) => rpc<void>("worker_fail_world_reference", { p_token: token, p_id: id, p_error: error, p_request_id: req }),
  getAdapter,
  put: (k: string, b: Uint8Array, ct: string) => putMedia(k, b, ct),
  env,
  log,
};

// AuraScript writing jobs (migration 0030): story development, outline, full script (in batches), scene rewrites.
const writingDeps = {
  claim: () => rpc<WritingClaim | null>("worker_claim_script_generation", { p_token: token }),
  progress: (id: string, progress: Record<string, unknown>, output: Record<string, unknown> | null) =>
    rpc<void>("worker_progress_script_generation", { p_token: token, p_id: id, p_progress: progress, p_output: output }),
  run: (job: WritingClaim, progress: (p: Record<string, unknown>, o: Record<string, unknown> | null) => Promise<void>) =>
    runWritingJob(job as never, { reasoner: () => reasoningProvider(env, { allowTest: env.AURA_TEST_PROVIDER !== "off" }), progress: (_id, p, o) => progress(p, o), env }),
  complete: (id: string, r: { output: unknown; checks: unknown[]; provider: string; model: string; test_output: boolean; usage: unknown }) =>
    rpc<void>("worker_complete_script_generation", { p_token: token, p_id: id, p_output: r.output, p_checks: r.checks, p_provider: r.provider, p_model: r.model, p_test_output: r.test_output, p_usage: r.usage }),
  fail: (id: string, error: string) => rpc<void>("worker_fail_script_generation", { p_token: token, p_id: id, p_error: error }),
  log,
};

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

// Script writing runs in its own lane: a full script can take many minutes of model calls, and it must never hold up
// the short interactive jobs (assistant plans, sounds, reference views, takes) in the main lane.
async function writingLane() {
  while (!stopping) {
    try {
      if (!(await writingOnce(writingDeps))) await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      log("worker.error", { lane: "writing", error: (e as Error).message });
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

(async () => {
  void writingLane();
  log("worker.started", { providers: ["aurastage-sketch", env.RUNWAY_API_KEY ? "runway" : null, env.OPENAI_API_KEY ? "openai" : null].filter(Boolean), planner: reasoningProvider(env, { allowTest: env.AURA_TEST_PROVIDER !== "off" })?.id ?? null });
  while (!stopping) {
    try {
      // Assistant plans are short and interactive, so they go first; then one generation take.
      const planned = await planOnce(plannerDeps);
      const sounded = await audioOnce(audioDeps);
      const drew = await refOnce(refDeps);
      const drewWorld = await refOnce(worldRefDeps);
      const worked = (await runOnce(deps)) || planned || sounded || drew || drewWorld;
      if (!worked) await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      log("worker.error", { error: (e as Error).message });
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  log("worker.stopped", {});
})();
