import { describe, expect, it } from "vitest";
import { NEUTRAL_GRADE } from "@aurastage/contracts";
import { deliveryProfile } from "../../deliveryProfileEngine";
import { renderManifestEngine } from "../engine";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clip = (n: number, over: Record<string, unknown>) => ({ id: U(n), source_in: 0, source_frames: null, scene_id: U(90), shot_id: U(80), take_id: null, audio_session_version_id: null, grade: NEUTRAL_GRADE, label: `C${n}`, ...over });
const input = (profile = "streaming_master", over: Record<string, unknown> = {}) => ({
  project: { id: U(1), title: "Shadows" },
  profile: deliveryProfile(profile),
  options: { watermark: "REVIEW", burn_timecode: true },
  picture_lock: { id: U(2), lock_number: 1, timeline_version_id: U(3) },
  fps: 24,
  clips: [
    clip(10, { track: "V1", kind: "take", record_in: 0, duration: 48, take_id: U(20) }),
    clip(11, { track: "V1", kind: "take", record_in: 72, duration: 24, take_id: U(21), grade: { ...NEUTRAL_GRADE, exposure: 0.5 } }),
    clip(12, { track: "A1", kind: "audio_mix", record_in: 0, duration: 96, source_frames: 96, audio_session_version_id: U(30) }),
  ],
  takes: { [U(20)]: { storage_key: "k20", media_type: "image/svg+xml", capability: "image", duration_seconds: null }, [U(21)]: { storage_key: "k21", media_type: "image/png", capability: "image", duration_seconds: null } },
  mixes: { [U(30)]: { scene_id: U(90), version_number: 1, seconds: 4, tracks: [{ id: "t", family: "DX", gain_db: "0", pan: "0", mute: false, solo: false }],
    clips: [{ track_id: "t", kind: "asset", asset_id: U(40), start_seconds: "1", duration_seconds: "1.5", offset_seconds: "0", gain_db: "0", fade_in_seconds: "0", fade_out_seconds: "0", source: { dialogue_line_id: "l1" } },
      { track_id: "t", kind: "cue", asset_id: null, start_seconds: "3", duration_seconds: "1", offset_seconds: "0", gain_db: "0", fade_in_seconds: "0", fade_out_seconds: "0", source: {} }] } },
  assets: { [U(40)]: { storage_key: "k40", media_type: "audio/wav" } },
  lines: { l1: { speaker: "TUNDE", text: "You came." } },
  ...over,
});

describe("renderManifestEngine", () => {
  it("builds gap-free picture (black in gaps), sound with real recordings only, captions and exact sources", () => {
    const { manifest, missing } = renderManifestEngine(input());
    expect(missing).toEqual([]);
    expect(manifest!.picture.map((s) => [s.kind, s.record_in, s.duration])).toEqual([["take", 0, 48], ["black", 48, 24], ["take", 72, 24]]);
    expect(manifest!.duration_frames).toBe(96);
    expect(manifest!.mixes[U(30)].clips).toHaveLength(1);
    expect(manifest!.subtitles!.cues[0]).toMatchObject({ start_frame: 24, text: "You came." });
    expect(manifest!.files).toEqual(["streaming_1080p24.mp4", "captions.srt"]);
    expect(manifest!.sources).toEqual({ take_ids: [U(20), U(21)], audio_session_version_ids: [U(30)], asset_ids: [U(40)], dialogue_line_ids: ["l1"], automation_revision: null });
    expect(manifest!.options).toEqual({ watermark: null, burn_timecode: false }); // streaming masters never carry review marks
  });
  it("review copies keep the watermark and timecode options", () => {
    expect(renderManifestEngine(input("review_copy")).manifest!.options).toEqual({ watermark: "REVIEW", burn_timecode: true });
  });
  it("refuses (with reasons) when media is missing or the profile isn't available", () => {
    const i = input();
    (i.takes as any)[U(21)].storage_key = null;
    expect(renderManifestEngine(i).missing).toEqual(["C11: the take's media file is missing"]);
    expect(renderManifestEngine(input("dcp_theatrical")).missing[0]).toMatch(/isn't available/);
    const slug = input();
    (slug.clips as any[])[0] = { ...(slug.clips as any[])[0], kind: "slug", take_id: null };
    expect(renderManifestEngine(slug).manifest).toBeNull();
  });
  it("EDL profile carries the CMX 3600 text; subtitles profile needs dialogue", () => {
    expect(renderManifestEngine(input("edit_decision_list")).manifest!.edl).toContain("FCM: NON-DROP FRAME");
    expect(renderManifestEngine(input("subtitles", { lines: {} })).missing).toContain("There is no dialogue in the locked cut to subtitle");
  });
  it("is deterministic", () => {
    expect(JSON.stringify(renderManifestEngine(input()))).toBe(JSON.stringify(renderManifestEngine(input())));
  });
});
