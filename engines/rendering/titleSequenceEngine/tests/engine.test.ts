import { describe, expect, it } from "vitest";
import { titleSequenceEngine } from "../engine";

const base = { title: "Shadows of Lagos", width: 1920, height: 1080, fps: 24, opening: { enabled: true, seconds: 5 }, end_credits: { enabled: true } };

describe("titleSequenceEngine", () => {
  it("makes an opening card with the title (and 'X presents' only when a company is set)", () => {
    const r = titleSequenceEngine({ ...base, credits: { company: "Aura Films" } });
    expect(r.opening).toMatchObject({ frames: 120, seconds: 5 });
    expect(r.opening!.svg).toContain("SHADOWS OF LAGOS");
    expect(r.opening!.svg).toContain("AURA FILMS PRESENTS");
    expect(titleSequenceEngine(base).opening!.svg).not.toContain("PRESENTS");
  });
  it("rolls only the credits that are set, the cast in order, and what made the film", () => {
    const r = titleSequenceEngine({ ...base, credits: { director: "Ada Obi", copyright: "© 2026 Aura Films" }, cast: [{ character: "Amara Bello" }, { character: "Tunde Okafor", performer: "AuraStage neural voice" }], made_with: ["AuraStage"] });
    const texts = r.end_credits!.lines.map((l) => l.text);
    expect(texts).toEqual(["Shadows of Lagos", "Directed by", "Ada Obi", "Cast", "Amara Bello", "Tunde Okafor — AuraStage neural voice", "Made with", "AuraStage", "© 2026 Aura Films"]);
    expect(texts).not.toContain("Produced by");
    expect(r.end_credits!.image_height).toBeGreaterThan(2 * 1080);
    expect(r.end_credits!.frames).toBe(Math.round(r.end_credits!.seconds * 24));
  });
  it("escapes text, scales to the frame, and is off unless asked for", () => {
    const r = titleSequenceEngine({ ...base, width: 1280, height: 720, title: "Tom & <Jerry>", end_credits: { enabled: false } });
    expect(r.opening!.svg).toContain("TOM &amp; &lt;JERRY&gt;");
    expect(r.opening!.svg).toContain('width="1280" height="720"');
    expect(r.end_credits).toBeNull();
    expect(titleSequenceEngine({ ...base, opening: { enabled: false } }).opening).toBeNull();
  });
  it("a slower roll takes longer", () => {
    const slow = titleSequenceEngine({ ...base, end_credits: { enabled: true, speed: "slow" }, cast: [{ character: "A" }] }).end_credits!;
    const fast = titleSequenceEngine({ ...base, end_credits: { enabled: true, speed: "fast" }, cast: [{ character: "A" }] }).end_credits!;
    expect(slow.seconds).toBeGreaterThan(fast.seconds);
  });
});
