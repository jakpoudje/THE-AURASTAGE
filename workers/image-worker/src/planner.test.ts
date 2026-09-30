import { describe, expect, it } from "vitest";
import { planOnce, type PlanClaim, type PlannerDeps } from "./planner";

const plan = { summary: "Make scene 3 night.", operation: "MODIFY_SCENE", calls: [], not_possible: [], questions: [] } as const;
function deps(job: PlanClaim | null, reasoner: PlannerDeps["reasoner"]) {
  const log: string[] = [];
  let seen: any;
  const d: PlannerDeps & { log_: string[]; seen: () => any } = {
    log_: log,
    seen: () => seen,
    claim: async () => job,
    complete: async (id, p, provider, model, test) => void log.push(`complete ${id} ${provider} ${model} ${test} ${p.summary}`),
    fail: async (id, e) => void log.push(`fail ${id} ${e}`),
    reasoner: () => {
      const r = reasoner();
      return r && { ...r, complete: (req: any, env: any) => ((seen = req), r.complete(req, env)) };
    },
    env: {},
    log: (e) => void log.push(e),
  };
  return d;
}
const job: PlanClaim = { id: "p1", module: "scene_dna", request: "Make scene 3 night", mode: "suggest", intent: {}, snapshot: { prompt: "PROMPT", request: { text: "Make scene 3 night" } } };

describe("assistant planner", () => {
  it("idles when nothing is queued", async () => {
    expect(await planOnce(deps(null, () => null))).toBe(false);
  });
  it("plans with the frozen prompt and snapshot, and records provider, model and the test label", async () => {
    const d = deps(job, () => ({ id: "aurastage-test", complete: async () => ({ data: plan as any, test_output: true, model: "m1", provider_request_id: null, usage: { input_tokens: 0, output_tokens: 0 } }) }));
    expect(await planOnce(d)).toBe(true);
    expect(d.seen()).toMatchObject({ prompt: "PROMPT", task: { kind: "plan", snapshot: job.snapshot } });
    expect(d.log_[0]).toBe("complete p1 aurastage-test m1 true Make scene 3 night.");
  });
  it("records a built-in plan at once — no provider is called, nothing is billed, not labelled test output", async () => {
    const built: PlanClaim = { ...job, snapshot: { planner: "builtin", provider: "aurastage", model: "story-intelligence-1.0.0", builtin_plan: plan } };
    let called = false;
    const d = deps(built, () => ({ id: "anthropic", complete: async () => { called = true; throw new Error("must not be called"); } }));
    expect(await planOnce(d)).toBe(true);
    expect(called).toBe(false);
    expect(d.log_[0]).toBe("complete p1 aurastage story-intelligence-1.0.0 false Make scene 3 night.");
  });
  it("fails the request plainly when no backend is connected (never invents a plan)", async () => {
    const d = deps(job, () => null);
    await planOnce(d);
    expect(d.log_[0]).toMatch(/^fail p1 No reasoning backend/);
  });
  it("records a provider error as a failed request", async () => {
    const d = deps(job, () => ({ id: "anthropic", complete: async () => { throw new Error("Claude is busy"); } }));
    await planOnce(d);
    expect(d.log_[0]).toBe("fail p1 Claude is busy");
  });
  it("sends a plan that breaks a tool's limits back once with the exact problem (regression: accent over 120 characters)", async () => {
    const schemas = { updateCharacter: { type: "object", properties: { character_id: { type: "string" }, changes: { type: "object", properties: { accent: { type: "string", maxLength: 120, nullable: true } }, additionalProperties: false } }, required: ["character_id", "changes"], additionalProperties: false } };
    const call = (accent: string) => ({ ...plan, calls: [{ tool: "updateCharacter", input_json: JSON.stringify({ character_id: "c1", changes: { accent } }), reason: "r" }] });
    const prompts: string[] = [];
    const answers = [call("x".repeat(180)), call("Lagos English with a light Yoruba lilt")];
    const d = deps({ ...job, snapshot: { ...job.snapshot, tool_schemas: schemas } }, () => ({ id: "anthropic", complete: async (req: any) => (prompts.push(req.prompt), { data: answers.shift() as any, test_output: false, model: "m", provider_request_id: null, usage: { input_tokens: 1, output_tokens: 1 } }) }));
    await planOnce(d);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/call 1 \(updateCharacter\): input\.changes\.accent: at most 120 characters \(this is 180\)/);
    expect(d.log_).toContain("plan.repair");
    expect(d.log_.find((l) => l.startsWith("complete"))).toBe("complete p1 anthropic m false Make scene 3 night.");
  });
  it("a plan within the limits is saved without a second call", async () => {
    let n = 0;
    const d = deps({ ...job, snapshot: { ...job.snapshot, tool_schemas: {} } }, () => ({ id: "anthropic", complete: async () => (n++, { data: plan as any, test_output: false, model: "m", provider_request_id: null, usage: { input_tokens: 0, output_tokens: 0 } }) }));
    await planOnce(d);
    expect(n).toBe(1);
  });
});
