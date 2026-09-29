import { describe, expect, it } from "vitest";
import { NEUTRAL_SESSION_MIX, NEUTRAL_TRACK_FX, TrackFxSchema } from "@aurastage/contracts";
import { applyChannelPreset, applyMixTemplate, applySpacePreset, channelPresetsFor, CHANNEL_PRESETS, MIX_TEMPLATES, SPACE_PRESETS } from "../engine";

describe("mixPresetEngine", () => {
  it("every preset is a valid channel strip / routing", () => {
    for (const p of CHANNEL_PRESETS) expect(() => applyChannelPreset(NEUTRAL_TRACK_FX, p.id)).not.toThrow();
    for (const t of MIX_TEMPLATES) expect(() => applyMixTemplate(NEUTRAL_SESSION_MIX, t.id)).not.toThrow();
    for (const s of SPACE_PRESETS) expect(() => applySpacePreset(NEUTRAL_SESSION_MIX, s.id)).not.toThrow();
  });

  it("phone call band-limits the voice; the person's automation and fader-side settings stay", () => {
    const mine = TrackFxSchema.parse({ automation: [{ t: 1, db: -3 }], delay_send_db: -20 });
    const r = applyChannelPreset(mine, "phone_call");
    expect(r.fx).toMatchObject({ hpf_hz: 300, lpf_hz: 3400, automation: [{ t: 1, db: -3 }], delay_send_db: -20 });
    expect(r.fx.comp.on).toBe(true);
    expect(r.space).toBeNull();
  });

  it("a preset that needs a room suggests it, and flat removes processing", () => {
    expect(applyChannelPreset(NEUTRAL_TRACK_FX, "large_hall")).toMatchObject({ space: { id: "large_hall" }, fx: { reverb_send_db: -6 } });
    const flat = applyChannelPreset(applyChannelPreset(NEUTRAL_TRACK_FX, "radio").fx, "flat").fx;
    expect(flat).toMatchObject({ hpf_hz: 0, lpf_hz: 0, comp: { on: false } });
  });

  it("presets for a track list the ones for its bus first", () => {
    expect(channelPresetsFor("DX")[0].for).toContain("DX");
    expect(channelPresetsFor("BG")[0].for).toContain("BG");
    expect(channelPresetsFor("SCORE")[0].for).toContain("MX");
  });

  it("a genre template sets buses and space but keeps mutes and the master", () => {
    const mine = { ...NEUTRAL_SESSION_MIX, buses: { ...NEUTRAL_SESSION_MIX.buses, BG: { gain_db: 0, mute: true } }, master: { gain_db: 2.5, limiter: false, ceiling_db: -2 } };
    const r = applyMixTemplate(mine, "horror");
    expect(r.mix.buses).toEqual({ DX: { gain_db: -1, mute: false }, FX: { gain_db: 0, mute: false }, BG: { gain_db: -2, mute: true }, MX: { gain_db: -3, mute: false } });
    expect(r.mix.master).toEqual(mine.master);
    expect(r.mix.reverb.type).toBe("hall");
    expect(applySpacePreset(mine, "cathedral").reverb).toEqual({ type: "hall", decay_s: 6, pre_delay_ms: 60, return_db: -1 });
  });

  it("unknown ids are refused", () => {
    expect(() => applyChannelPreset(NEUTRAL_TRACK_FX, "nope")).toThrow();
    expect(() => applyMixTemplate(NEUTRAL_SESSION_MIX, "nope")).toThrow();
  });
});
