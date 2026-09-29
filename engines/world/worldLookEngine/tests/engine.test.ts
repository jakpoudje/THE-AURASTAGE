import { describe, expect, it } from "vitest";
import { worldLookEngine } from "../engine";

describe("worldLookEngine", () => {
  const loc = { name: "Lagos Harbour", description: "Rusting cranes and stacked containers", int_ext: ["EXT"], times_of_day: ["DAWN", "NIGHT"] };
  it("makes location views for each time of day the script uses, all repeating one identity", () => {
    const r = worldLookEngine({ kind: "location", item: loc, style: "Gritty 35mm" });
    expect(r.views).toHaveLength(8);
    expect(r.views.filter((v) => v.in_default_set).map((v) => v.key)).toEqual(["establishing:DAWN", "wide:DAWN", "detail:DAWN", "establishing:NIGHT", "wide:NIGHT"]);
    for (const v of r.views) expect(v.prompt).toContain(r.identity);
    expect(r.views.find((v) => v.key === "wide:NIGHT")!.prompt).toMatch(/at night/);
    expect(r.identity).toBe("Lagos Harbour — exterior. Rusting cranes and stacked containers.");
    expect(r.missing).toEqual([]);
  });
  it("prop views; the identity hash changes with the description, not with the views asked for", () => {
    const a = worldLookEngine({ kind: "prop", item: { name: "Notebook", description: "Battered, red cover" } });
    const b = worldLookEngine({ kind: "prop", item: { name: "Notebook", description: "Battered, red cover" }, views: ["hero"] });
    const c = worldLookEngine({ kind: "prop", item: { name: "Notebook", description: "Blue cover" } });
    expect(a.views.map((v) => v.key)).toEqual(["hero", "three_quarter", "detail", "overhead", "in_hand"]);
    expect(b.views.map((v) => v.key)).toEqual(["hero"]);
    expect(a.identity_hash).toBe(b.identity_hash);
    expect(a.identity_hash).not.toBe(c.identity_hash);
    expect(worldLookEngine({ kind: "prop", item: { name: "Danfo", category: "vehicle" } }).views[0].aspect_ratio).toBe("16:9");
    expect(worldLookEngine({ kind: "prop", item: { name: "Pen" } }).missing).toEqual(["description"]);
  });
});
