// Ask AuraStage planning jobs (migration 0025). The API froze the request, intent, context and prompt into the
// proposal; this worker only asks the reasoning backend for a Plan, validated against PlanSchema, and records it with
// the provider, model and whether it is labelled TEST OUTPUT (rule 12). Applying is the user's decision, in the API.
import { PLANNER_SYSTEM, PlanSchema, type Plan } from "@aurastage/aura-intelligence";

export interface PlanClaim { id: string; module: string; request: string; mode: string; intent: unknown; snapshot: { prompt?: string } & Record<string, unknown> }
interface Reasoner {
  id: string;
  complete(req: { system: string; prompt: string; schema: typeof PlanSchema; effort?: "low" | "medium" | "high"; task?: { kind: "plan"; snapshot: unknown } }, env: Record<string, string | undefined>):
    Promise<{ data: Plan; test_output: boolean; model: string; provider_request_id: string | null; usage: { input_tokens: number; output_tokens: number } }>;
}
export interface PlannerDeps {
  claim(): Promise<PlanClaim | null>;
  complete(id: string, plan: Plan, provider: string, model: string, testOutput: boolean, requestId: string | null): Promise<void>;
  fail(id: string, error: string): Promise<void>;
  reasoner(): Reasoner | null;
  env: Record<string, string | undefined>;
  log(event: string, data: Record<string, unknown>): void;
}

export async function planOnce(d: PlannerDeps): Promise<boolean> {
  const job = await d.claim();
  if (!job) return false;
  const r = d.reasoner();
  if (!r) {
    await d.fail(job.id, "No reasoning backend is connected. Add ANTHROPIC_API_KEY on the server to use Claude.");
    d.log("plan.failed", { id: job.id, reason: "no_backend" });
    return true;
  }
  try {
    const res = await r.complete({ system: PLANNER_SYSTEM, prompt: String(job.snapshot.prompt ?? job.request), schema: PlanSchema, effort: "medium", task: { kind: "plan", snapshot: job.snapshot } }, d.env);
    await d.complete(job.id, res.data, r.id, res.model, res.test_output, res.provider_request_id);
    d.log("plan.completed", { id: job.id, provider: r.id, model: res.model, test_output: res.test_output, calls: res.data.calls.length, tokens: res.usage.input_tokens + res.usage.output_tokens });
  } catch (e) {
    await d.fail(job.id, (e as Error).message);
    d.log("plan.failed", { id: job.id, provider: r.id, error: (e as Error).message });
  }
  return true;
}
