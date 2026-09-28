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
});
