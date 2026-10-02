import { describe, expect, it } from "vitest";
import { enableRequestMemo, once } from "../requestMemo";

describe("request memo (Dashboard overview speed, 2026-10-02)", () => {
  it("runs a refresh once per request when the request opts in; other requests and keys run normally", async () => {
    let n = 0;
    const work = async () => ++n;
    const a = {}, b = {};
    enableRequestMemo(a);
    expect(await Promise.all([once(a, "k", work), once(a, "k", work), once(a, "k", work)])).toEqual([1, 1, 1]);
    expect(await once(a, "other", work)).toBe(2);
    // A request that didn't opt in (e.g. one that writes) always gets a fresh run.
    expect(await once(b, "k", work)).toBe(3);
    expect(await once(b, "k", work)).toBe(4);
  });
});
