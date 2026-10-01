import { describe, expect, it } from "vitest";
import { musicSuggestionEngine, MUSIC_LIBRARY } from "../engine";
import { proceduralAudioEngine } from "../../proceduralAudioEngine";

describe("musicSuggestionEngine", () => {
  it("picks the style from Scene DNA mood first and says why; instruments come from where the story is set", () => {
    const m = musicSuggestionEngine({
      film: { genre: "Political thriller", tone: "Tense", setting: "Lagos, Nigeria" },
      scene: { number: 3, heading: "INT. OFFICE - NIGHT", mood: ["melancholic"], emotions: ["anger", "anger"], seconds: 60, dialogue_seconds: 20 },
      position: { index: 2, total: 10 },
    });
    expect(m.needed).toBe(true);
    expect(m.style.id).toBe("sorrow_pad");
    expect(m.key).toBe("D minor");
    expect(m.why[0]).toContain("Scene DNA mood");
    expect(m.instruments).toContain("talking drum");
    expect(m.engine_version).toBe("1.1.0");
  });

  it("falls back to the dialogue's emotions, then the film's tone", () => {
    expect(musicSuggestionEngine({ scene: { number: 1, emotions: ["fear", "fear", "joy"] }, position: { index: 1, total: 3 } }).style.id).toBe("tense_pulse");
    expect(musicSuggestionEngine({ film: { tone: "Hopeful" }, scene: { number: 1 }, position: { index: 1, total: 3 } }).style.id).toBe("bright_rise");
    const none = musicSuggestionEngine({ scene: { number: 1 }, position: { index: 1, total: 3 } });
    expect(none.style.id).toBe("neutral_pad");
    expect(none.why[0]).toContain("no mood");
  });

  it("leaves a dialogue-heavy scene with no strong mood without score; keeps the opening and the ending scored", () => {
    const talky = musicSuggestionEngine({ scene: { number: 4, seconds: 40, dialogue_seconds: 38 }, position: { index: 3, total: 8 } });
    expect(talky.needed).toBe(false);
    expect(talky.level_db).toBe(-60);
    const opening = musicSuggestionEngine({ scene: { number: 1, seconds: 40, dialogue_seconds: 38 }, position: { index: 0, total: 8 } });
    expect(opening.needed).toBe(true);
    expect(opening.description).toContain("main theme");
    expect(musicSuggestionEngine({ scene: { number: 8, seconds: 40, dialogue_seconds: 38 }, position: { index: 7, total: 8 } }).needed).toBe(true);
  });

  it("every library style is what the built-in generator really plays from the suggestion's description", () => {
    for (const s of MUSIC_LIBRARY) {
      const desc = `${s.name} (${s.words}) in ${s.key}, ${s.bpm} BPM — ${s.feel}`;
      const out = proceduralAudioEngine({ kind: "score", description: desc, duration_seconds: 0.5, seed: 1 });
      const played = JSON.stringify(out.layers).toLowerCase();
      expect(played, s.id).toContain(s.id === "neutral_pad" ? "neutral pad" : s.name.toLowerCase());
    }
  });

  it("1.1.0: every scene gets a free ambient bed in its mood — even a talky one with no score — and the generator plays it as a bed", () => {
    const talky = musicSuggestionEngine({ scene: { number: 4, mood: ["tense"], seconds: 40, dialogue_seconds: 38 }, position: { index: 3, total: 8 } });
    expect(talky.ambient.description).toMatch(/^Ambient bed — tense, suspense/);
    expect(talky.ambient.level_db).toBe(-28);
    const quiet = musicSuggestionEngine({ scene: { number: 4, seconds: 40, dialogue_seconds: 38 }, position: { index: 3, total: 8 } });
    expect(quiet.needed).toBe(false);
    expect(quiet.ambient.description).toMatch(/^Ambient bed — calm/);
    const played = proceduralAudioEngine({ kind: "score", description: talky.ambient.description, duration_seconds: 3, sample_rate: 44100 });
    expect(played.layers[0].name).toBe("tense minor pulse — ambient bed");
  });
});
