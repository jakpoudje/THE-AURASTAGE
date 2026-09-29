import { describe, expect, it } from "vitest";
import { generationReadinessEngine } from "../engine";

const ev = (over = {}) => ({ succeeded: 0, failed: 0, last_success_at: null, last_success_backend: null, ...over });
describe("generationReadinessEngine", () => {
  it("proven only with a configured backend AND a real success in this project", () => {
    const r = generationReadinessEngine([
      { id: "sound", label: "Sound", where: "Audio Studio", backends: [{ id: "aurastage-synth", name: "AuraStage built-in sound", execution: "native", state: "configured" }],
        evidence: ev({ succeeded: 3, failed: 1, last_success_at: "2026-09-29T10:15:00Z", last_success_backend: "aurastage-synth" }) },
    ]).capabilities[0];
    expect(r).toMatchObject({ state: "proven", headline: "Works — last made 2026-09-29 10:15 UTC with AuraStage built-in sound (3 made in this project, 1 failed)." });
    expect(r.now).toEqual(["AuraStage built-in sound — built in, free"]);
  });
  it("ready when configured but unused; needs_key names the exact variable; not_built says so", () => {
    const r = generationReadinessEngine([
      { id: "img", label: "Images", where: "Visual Generation", backends: [{ id: "aurastage-sketch", name: "AuraStage Sketch", execution: "native", state: "configured" }, { id: "openai", name: "OpenAI Images", execution: "external", state: "not_configured", key: "OPENAI_API_KEY" }], evidence: ev() },
      { id: "video", label: "Video", where: "Visual Generation", backends: [{ id: "runway", name: "Runway", execution: "external", state: "not_configured", key: "RUNWAY_API_KEY" }], evidence: ev() },
      { id: "voice", label: "Voice", where: "Audio Studio", backends: [{ id: "elevenlabs", name: "ElevenLabs", execution: "external", state: "not_built", key: "ELEVENLABS_API_KEY" }], evidence: ev() },
    ]);
    expect(r.capabilities.map((c) => c.state)).toEqual(["ready", "needs_key", "not_built"]);
    expect(r.capabilities[0].upgrades).toEqual([{ name: "OpenAI Images", key: "OPENAI_API_KEY", built: true }]);
    expect(r.capabilities[1].headline).toBe("Built, waiting for a key: add RUNWAY_API_KEY to switch on Runway.");
    expect(r.capabilities[2].upgrades).toEqual([{ name: "ElevenLabs", key: "ELEVENLABS_API_KEY", built: false }]);
    expect(r.summary).toEqual({ proven: 0, ready: 1, needs_key: 1, not_built: 1, total: 3 });
  });
  it("test output alone is never 'ready'", () => {
    const r = generationReadinessEngine([{ id: "a", label: "Assistant", where: "Everywhere", backends: [{ id: "test", name: "Test planner", execution: "test", state: "configured" }, { id: "anthropic", name: "Claude", execution: "external", state: "not_configured", key: "ANTHROPIC_API_KEY" }], evidence: ev({ succeeded: 5, last_success_backend: "test" }) }]);
    expect(r.capabilities[0].state).toBe("needs_key");
  });
});
