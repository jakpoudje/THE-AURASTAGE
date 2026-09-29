// AuraScript writing jobs (migration 0030). Claims a job, runs it through the API's job runner (the Provider Gateway's
// reasoning backend, checked by scriptWritingEngine), reports progress after every batch of scenes, and records the
// result with provider, model and TEST OUTPUT label (rule 12). Using the result is the writer's decision, in the API.
export interface WritingClaim { id: string; kind: "develop_story" | "outline" | "write_script" | "rewrite_scene"; input: Record<string, unknown>; output: Record<string, unknown> | null }
export interface WritingDeps {
  claim(): Promise<WritingClaim | null>;
  run(job: WritingClaim, progress: (progress: Record<string, unknown>, output: Record<string, unknown> | null) => Promise<void>):
    Promise<{ output: Record<string, unknown>; checks: unknown[]; provider: string; model: string; test_output: boolean; usage: Record<string, number> }>;
  progress(id: string, progress: Record<string, unknown>, output: Record<string, unknown> | null): Promise<void>;
  complete(id: string, r: { output: unknown; checks: unknown[]; provider: string; model: string; test_output: boolean; usage: unknown }): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  log(event: string, data: Record<string, unknown>): void;
}

export async function writingOnce(d: WritingDeps): Promise<boolean> {
  const job = await d.claim();
  if (!job) return false;
  const t = Date.now();
  d.log("writing.claimed", { id: job.id, kind: job.kind });
  try {
    const r = await d.run(job, (p, o) => d.progress(job.id, p, o));
    await d.complete(job.id, r);
    d.log("writing.completed", { id: job.id, kind: job.kind, provider: r.provider, model: r.model, test_output: r.test_output, ms: Date.now() - t, ...r.usage });
  } catch (e) {
    await d.fail(job.id, (e as Error).message);
    d.log("writing.failed", { id: job.id, kind: job.kind, error: (e as Error).message });
  }
  return true;
}
