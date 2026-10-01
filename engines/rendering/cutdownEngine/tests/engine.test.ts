import { describe, expect, it } from "vitest";
import { cutdownEngine } from "../engine";

// A 10-scene cut, 20 s each at 24 fps, picture on V1 and each scene's mix on A1; scene 7 is the most intense.
const fps = 24, sec = 20 * fps;
const clips = Array.from({ length: 10 }, (_, k) => [
  { id: `v${k}`, track: "V1" as const, kind: "take", record_in: k * sec, duration: sec, source_in: 0, scene_id: `s${k + 1}`, take_id: `t${k}` },
  { id: `a${k}`, track: "A1" as const, kind: "audio_mix", record_in: k * sec, duration: sec, source_in: 0, scene_id: `s${k + 1}` },
]).flat();
const scenes = Array.from({ length: 10 }, (_, k) => ({ scene_id: `s${k + 1}`, number: k + 1, intensity: k === 6 ? 9 : k >= 4 ? 7 : 3 }));

describe("cutdownEngine", () => {
  it("social: the hook is the strongest moment, then strong moments in story order; picture and sound stay in sync; ends on the title card", () => {
    const r = cutdownEngine({ kind: "social", seconds: 30, fps, clips, scenes, title: "Shadows of Lagos" });
    expect(r.windows[0]).toMatchObject({ section: "hook", scene_number: 7 });
    const later = r.windows.slice(1).map((w) => w.from);
    expect(later).toEqual([...later].sort((a, b) => a - b));
    expect(Math.abs(r.frames - (30 * fps - Math.round(2.5 * fps)))).toBeLessThan(fps * 2);
    // Every picture piece has its sound at the same place, from the same point in the scene.
    for (const v of r.clips.filter((c) => c.track === "V1")) {
      const a = r.clips.find((c) => c.track === "A1" && c.record_in === v.record_in)!;
      expect(a).toMatchObject({ duration: v.duration, source_in: v.source_in, scene_id: v.scene_id });
    }
    expect(r.cards.at(-1)!.text).toBe("Watch Shadows of Lagos");
  });
  it("trailer: setup from the opening, an escalation montage, the climax tease, logline text cards and the title", () => {
    const r = cutdownEngine({ kind: "trailer", seconds: 90, fps, clips, scenes, title: "Shadows of Lagos",
      logline: "When her brother vanishes, a journalist must expose the rigged election — but the governor will kill to keep it buried." });
    const sections = [...new Set(r.windows.map((w) => w.section))];
    expect(sections).toEqual(["setup", "escalation", "climax tease"]);
    expect(r.windows.at(-1)!.scene_number).toBe(7);
    expect(r.cards.map((c) => c.text)).toEqual(expect.arrayContaining(["A JOURNALIST MUST EXPOSE THE RIGGED ELECTION", "SHADOWS OF LAGOS"]));
    expect(r.frames).toBeLessThanOrEqual(90 * fps);
  });
});
