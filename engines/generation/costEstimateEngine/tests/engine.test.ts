import { describe, expect, it } from "vitest";
import { costEstimateEngine, formatCost } from "../engine";
import { PRICES } from "../prices";

describe("costEstimateEngine", () => {
  it("built-in generators are free", () => {
    const e = costEstimateEngine({ items: [{ provider: "aurastage-sketch", model: "sketch", count: 8 }] });
    expect(e).toMatchObject({ free: true, total: { min: 0, max: 0, complete: true } });
    expect(formatCost(e.total.min, e.total.max, { free: e.free })).toBe("Free");
  });
  it("images and video are priced per image and per second from the published prices", () => {
    const e = costEstimateEngine({ items: [
      { provider: "bfl", model: "flux-pro-1.1", count: 3 },
      { provider: "runway", model: "gen4_turbo", count: 2, seconds: 10 },
    ] });
    expect(e.lines.map((l) => [l.min, l.max])).toEqual([[0.12, 0.12], [1, 1]]);
    expect(e.total).toEqual({ min: 1.12, max: 1.12, complete: true });
    expect(formatCost(e.total.min, e.total.max)).toBe("$1.12");
  });
  it("AI writing is estimated from the text size (≈4 characters a token), as a range for how long the reply runs", () => {
    const e = costEstimateEngine({ items: [{ provider: "anthropic", model: "claude-opus-5-5", input_chars: 40000, output_chars: 8000 }] });
    // 10,000 tokens in at $4/M = $0.04; 2,000 out at $20/M = $0.04 → $0.08 expected; half to double the reply: $0.06–$0.12
    expect(e.lines[0]).toMatchObject({ min: 0.06, max: 0.12, free: false });
    expect(formatCost(e.lines[0].min, e.lines[0].max)).toBe("$0.06–$0.12");
  });
  it("a paid model without a confirmed price never gets a made-up number; the total becomes 'at least'", () => {
    const e = costEstimateEngine({ items: [{ provider: "kling", model: "kling-v2-1", count: 1 }, { provider: "bfl", model: "flux-pro-1.1-ultra", count: 1 }] });
    expect(e.lines[0]).toMatchObject({ min: null, max: null, source: "https://kling.ai/dev/pricing" });
    expect(e.total.complete).toBe(false);
    expect(formatCost(e.total.min, e.total.max, { complete: e.total.complete })).toBe("at least $0.06");
  });
  it("every price names where it was published", () => {
    expect(PRICES.every((p) => /^https:\/\//.test(p.source))).toBe(true);
  });
});
