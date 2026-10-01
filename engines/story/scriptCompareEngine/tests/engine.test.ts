import { describe, expect, it } from "vitest";
import { scriptCompareEngine } from "../engine";

const V1 = `INT. NEWSROOM - NIGHT\n\nAmara types.\n\nAMARA\nThey buried it.\n\nEXT. HARBOUR - DAWN\n\nTunde waits by the water.\n\nINT. MARKET - DAY\n\nTraders shout.\n`;
const V2 = `INT. NEWSROOM - NIGHT\n\nAmara types, furious.\n\nAMARA\nThey buried it.\n\nEXT. HARBOUR - DAWN\n\nTunde waits by the water.\n\nINT. POLICE STATION - DAY\n\nA cell door slams.\n`;

describe("scriptCompareEngine", () => {
  it("compares scene by scene: changed lines inside a scene, scenes added and removed, the rest unchanged", () => {
    const r = scriptCompareEngine({ from: { version_number: 1, source_text: V1 }, to: { version_number: 2, source_text: V2 } });
    expect(r.summary).toMatchObject({ scenes_from: 3, scenes_to: 3, changed: 1, unchanged: 1, added: 1, removed: 1 });
    const newsroom = r.scenes.find((s) => s.heading_to === "INT. NEWSROOM - NIGHT")!;
    expect(newsroom).toMatchObject({ status: "changed", lines_added: 1, lines_removed: 1 });
    expect(newsroom.diff).toContainEqual({ op: "removed", text: "Amara types." });
    expect(newsroom.diff).toContainEqual({ op: "added", text: "Amara types, furious." });
    expect(r.scenes.find((s) => s.status === "added")!.heading_to).toBe("INT. POLICE STATION - DAY");
  });
  it("a renamed heading with the same words is a change, not a removal; identical versions are unchanged", () => {
    const renamed = V1.replace("EXT. HARBOUR - DAWN", "EXT. LAGOS HARBOUR - DAWN");
    const r = scriptCompareEngine({ from: { version_number: 1, source_text: V1 }, to: { version_number: 2, source_text: renamed } });
    expect(r.summary).toMatchObject({ changed: 1, added: 0, removed: 0 });
    expect(scriptCompareEngine({ from: { version_number: 1, source_text: V1 }, to: { version_number: 1, source_text: V1 } }).summary).toMatchObject({ unchanged: 3, changed: 0 });
  });
});
