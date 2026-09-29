import { describe, expect, it } from "vitest";
import { assembleScript, checkOutline, checkRewrite, checkScenes, outlineRequest, rewriteRequest, writeScenesRequest, writingBatches } from "../engine";
import type { OutlineScene } from "../schemas";

const story = {
  title: "Shadows of Lagos", logline: "A journalist uncovers a buried election fraud.", genre: "Thriller", target_runtime_minutes: 10,
  characters: [{ name: "Tunde Okafor", role: "protagonist", age: 35, description: "Investigative journalist" }, { name: "Amara Bello", role: "supporting", age: 32, description: "Source" }],
  beats: [{ act: 1, title: "The tip", summary: "Tunde gets the file", approx_minute: 0 }, { act: 2, title: "The meeting", summary: "Amara meets him", approx_minute: 5 }],
};
const sc = (n: number, loc: string, mins: number, beat: string, chars: string[]): OutlineScene => ({ number: n, int_ext: "INT", location: loc, time_of_day: "NIGHT", purpose: "p", beat, summary: "s", characters: chars, est_minutes: mins });
const outline = [sc(1, "TUNDE'S FLAT", 4, "The tip", ["Tunde Okafor"]), sc(2, "HARBOUR OFFICE", 5, "The meeting", ["Tunde Okafor", "Amara Bello"])];

describe("scriptWritingEngine", () => {
  it("outline prompt carries the bible and the runtime; checks catch a bad outline", () => {
    const r = outlineRequest({ story });
    expect(r.prompt).toMatch(/Tunde Okafor \(protagonist, 35\)/);
    expect(r.prompt).toMatch(/about 5 scenes totalling 10 minutes/);
    const ok = checkOutline(story, { scenes: outline, notes: [] });
    expect(ok.every((c) => c.ok)).toBe(true);
    const bad = checkOutline(story, { scenes: [sc(1, "flat", 2, "x", [])], notes: [] });
    expect(bad.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual(["beats", "headings", "mains", "runtime"]);
  });
  it("writes in batches that fit, and checks each written scene against its outline", () => {
    expect(writingBatches([...outline, sc(3, "X", 6, "b", []), sc(4, "Y", 1, "b", [])], 5, 10)).toEqual([[1, 2], [3, 4]]);
    const req = writeScenesRequest({ story, outline, numbers: [1] });
    expect(req.prompt).toMatch(/WRITE SCENES 1 now/);
    const text = "INT. TUNDE'S FLAT - NIGHT\n\nTUNDE OKAFOR (35) paces. " + "Rain hammers the window. ".repeat(60) + "\n\nTUNDE\nThey buried it.\n\nKOLA\nWho?\n";
    const checks = checkScenes({ story, outline, numbers: [1, 2] }, { scenes: [{ number: 1, fountain: text }] });
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(by.all_written.ok).toBe(false);
    expect(by.all_written.evidence).toBe("Missing: 2");
    expect(by.headings.ok).toBe(true);
    expect(by.cast.evidence).toMatch(/KOLA/);
    expect(assembleScript("Shadows of Lagos", [{ number: 2, fountain: "INT. B - DAY\n\nx" }, { number: 1, fountain: "INT. A - DAY\n\ny" }])).toMatch(/^Title: Shadows of Lagos\n\nINT\. A - DAY\n\ny\n\nINT\. B - DAY/);
  });
  it("rewrites keep the heading; expand must grow and condense must shrink", () => {
    const scene = "INT. FLAT - NIGHT\n\nTunde paces by the window, restless.\n\nTUNDE\nThey buried it.\n";
    expect(rewriteRequest({ story, mode: "condense", scene_text: scene }).prompt).toMatch(/Condense this scene/);
    const grown = checkRewrite({ story, mode: "expand", scene_text: scene }, { fountain: scene + "\nHe stops. Listens.\n\nTUNDE\nNot deep enough.\n", changes: [] });
    expect(grown.every((c) => c.ok)).toBe(true);
    const moved = checkRewrite({ story, mode: "improve", scene_text: scene }, { fountain: "EXT. STREET - DAY\n\nx y z\n", changes: [] });
    expect(moved.find((c) => c.id === "heading")!.ok).toBe(false);
  });
});
