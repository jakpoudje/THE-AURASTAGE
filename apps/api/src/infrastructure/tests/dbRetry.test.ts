import { describe, expect, it } from "vitest";
import { isStatementTimeout, retryOnTimeout } from "../dbRetry";

describe("retryOnTimeout (BUILD_PLAN item 50)", () => {
  it("runs a call cancelled for a statement timeout once more", async () => {
    let n = 0;
    const r = await retryOnTimeout(async () => (++n === 1 ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } : { data: "ok", error: null }), 0);
    expect(r).toEqual({ data: "ok", error: null });
    expect(n).toBe(2);
  });
  it("retries only once", async () => {
    let n = 0;
    const r = await retryOnTimeout(async () => { n++; return { data: null, error: { code: "57014" } }; }, 0);
    expect(r.error?.code).toBe("57014");
    expect(n).toBe(2);
  });
  it("never retries other errors (they may have committed or are real refusals)", async () => {
    let n = 0;
    const r = await retryOnTimeout(async () => { n++; return { data: null, error: { code: "42501", message: "denied" } }; }, 0);
    expect(r.error?.code).toBe("42501");
    expect(n).toBe(1);
    expect(isStatementTimeout({ message: "fetch failed" })).toBe(false);
  });
});
