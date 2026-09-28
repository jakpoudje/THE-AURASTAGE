import { describe, expect, it } from "vitest";
import { NEUTRAL_GRADE } from "@aurastage/contracts";
import { edlExportEngine } from "../engine";
import { timecode } from "../../timeline";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
describe("edlExportEngine", () => {
  it("writes CMX 3600 events with source and record timecodes", () => {
    const clips = [
      { id: U(1), track: "V1", kind: "take", record_in: 0, duration: 48, source_in: 12, source_frames: 120, scene_id: null, shot_id: null, take_id: "abcdef12-0000-4000-8000-000000000000", audio_session_version_id: null, label: "Scene 1 · Shot 1", grade: NEUTRAL_GRADE },
      { id: U(2), track: "V1", kind: "slug", record_in: 48, duration: 24, source_in: 0, source_frames: null, scene_id: null, shot_id: null, take_id: null, audio_session_version_id: null, label: "Missing", grade: NEUTRAL_GRADE },
    ];
    const r = edlExportEngine({ title: "Shadows", fps: 24, clips });
    expect(r.events).toBe(2);
    expect(r.edl).toContain("TITLE: Shadows\nFCM: NON-DROP FRAME");
    expect(r.edl).toContain("001  ABCDEF12 V     C        00:00:00:12 00:00:02:12 01:00:00:00 01:00:02:00");
    expect(r.edl).toContain("002  BL       V     C        00:00:00:00 00:00:01:00 01:00:02:00 01:00:03:00");
    expect(r.edl).toContain("* OFFLINE");
  });
  it("timecode rolls over seconds, minutes and hours", () => {
    expect(timecode(24 * 3661 + 5, 24)).toBe("01:01:01:05");
    expect(timecode(0, 24, 1)).toBe("01:00:00:00");
  });
});
