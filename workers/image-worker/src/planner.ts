// Ask AuraStage planning jobs (migration 0025). The API froze the request, intent, context and prompt into the
// proposal; this worker only asks the reasoning backend for a Plan, validated against PlanSchema, and records it with
// the provider, model and whether it is labelled TEST OUTPUT (rule 12). Applying is the user's decision, in the API.
import { PLANNER_SYSTEM, PlanSchema, planProblems, repairPrompt, type Plan } from "@aurastage/aura-intelligence";

export interface PlanClaim { id: string; module: string; request: string; mode: string; intent: unknown; snapshot: { prompt?: string } & Record<string, unknown> }
interface Reasoner {
  id: string;
  complete(req: { system: string; prompt: string; schema: typeof PlanSchema; effort?: "low" | "medium" | "high"; task?: { kind: "plan"; snapshot: unknown } }, env: Record<string, string | undefined>):
    Promise<{ data: Plan; test_output: boolean; model: string; provider_request_id: string | null; provider?: string; usage: { input_tokens: number; output_tokens: number } }>;
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
  // Built-in story intelligence: the API's engines already planned it (free, deterministic). Validate and record it —
  // no provider is called and nothing is billed.
  const built = job.snapshot.planner === "builtin" ? PlanSchema.safeParse(job.snapshot.builtin_plan) : null;
  if (built) {
    if (!built.success) {
      await d.fail(job.id, "The built-in plan isn't in the expected shape (bug).");
      d.log("plan.failed", { id: job.id, reason: "builtin_invalid" });
      return true;
    }
    const provider = String(job.snapshot.provider ?? "aurastage"), model = String(job.snapshot.model ?? "story-intelligence");
    await d.complete(job.id, built.data, provider, model, false, null);
    d.log("plan.completed", { id: job.id, provider, model, test_output: false, calls: built.data.calls.length, tokens: 0 });
    return true;
  }
  const r = d.reasoner();
  if (!r) {
    await d.fail(job.id, "No reasoning backend is connected. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY on the server.");
    d.log("plan.failed", { id: job.id, reason: "no_backend" });
    return true;
  }
  try {
    const prompt = String(job.snapshot.prompt ?? job.request);
    const ask = (p: string) => r.complete({ system: PLANNER_SYSTEM, prompt: p, schema: PlanSchema, effort: "medium", task: { kind: "plan", snapshot: job.snapshot } }, d.env);
    let res = await ask(prompt);
    // A call that breaks a tool's limits (e.g. an accent over 120 characters) goes back to the model once, with the
    // exact problems, instead of reaching the person as an error. The API still validates whatever comes back.
    const schemas = job.snapshot.tool_schemas as Record<string, unknown> | undefined;
    const problems = schemas ? planProblems(res.data, schemas) : [];
    if (problems.length) {
      d.log("plan.repair", { id: job.id, problems: problems.slice(0, 10) });
      const fixed = await ask(repairPrompt(prompt, res.data, problems));
      const left = planProblems(fixed.data, schemas!);
      if (left.length <= problems.length) res = { ...fixed, usage: { input_tokens: res.usage.input_tokens + fixed.usage.input_tokens, output_tokens: res.usage.output_tokens + fixed.usage.output_tokens } };
    }
    await d.complete(job.id, res.data, res.provider ?? r.id, res.model, res.test_output, res.provider_request_id);
    d.log("plan.completed", { id: job.id, provider: res.provider ?? r.id, model: res.model, test_output: res.test_output, calls: res.data.calls.length, tokens: res.usage.input_tokens + res.usage.output_tokens });
  } catch (e) {
    await d.fail(job.id, (e as Error).message);
    d.log("plan.failed", { id: job.id, provider: r.id, error: (e as Error).message });
  }
  return true;
}
