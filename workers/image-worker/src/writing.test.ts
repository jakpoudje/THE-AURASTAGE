import { describe, expect, it } from "vitest";
import { writingOnce, type WritingClaim, type WritingDeps } from "./writing";

function deps(job: WritingClaim | null, run: WritingDeps["run"]) {
  const log: string[] = [];
  const d: WritingDeps & { log_: string[] } = {
    log_: log, claim: async () => job, run,
    progress: async (id, p) => void log.push(`progress ${id} ${JSON.stringify(p)}`),
    complete: async (id, r) => void log.push(`complete ${id} ${r.provider} ${r.test_output}`),
    fail: async (id, e) => void log.push(`fail ${id} ${e}`),
    log: (e) => void log.push(e),
  };
  return d;
}
describe("AuraScript writing worker", () => {
  it("idles when nothing is queued", async () => expect(await writingOnce(deps(null, async () => { throw new Error("no"); }))).toBe(false));
  it("reports progress through the run and records the result with its provider and label", async () => {
    const d = deps({ id: "g1", kind: "write_script", input: {}, output: null }, async (_j, progress) => {
      await progress({ done: 3, total: 6 }, { scenes: [] });
      return { output: { scenes: [] }, checks: [], provider: "anthropic", model: "m", test_output: false, usage: { calls: 2 } };
    });
    await writingOnce(d);
    expect(d.log_).toEqual(expect.arrayContaining(['progress g1 {"done":3,"total":6}', "complete g1 anthropic false"]));
  });
  it("a failure is recorded with its reason — never a fake script", async () => {
    const d = deps({ id: "g2", kind: "outline", input: {}, output: null }, async () => { throw new Error("Claude declined this request."); });
    await writingOnce(d);
    expect(d.log_).toContain("fail g2 Claude declined this request.");
  });
});
