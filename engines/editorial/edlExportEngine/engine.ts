// engines/editorial/edlExportEngine
// Writes the timeline as a CMX 3600 EDL so the cut can be opened in other editors.
import { end, onTrack, timecode } from "../timeline";
import { RECORD_START_HOUR, REEL_MAX } from "./rules";
import { validateEdlExportInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { EdlExportOutput } from "./output.schema";

export function edlExportEngine(raw: unknown): EdlExportOutput {
  const { title, fps, clips } = validateEdlExportInput(raw);
  const tc = (f: number, hour = 0) => timecode(f, fps, hour);
  const lines = [`TITLE: ${title.replace(/[\r\n]+/g, " ").slice(0, 70)}`, "FCM: NON-DROP FRAME", ""];
  let n = 0;
  for (const track of ["V1", "A1"] as const) {
    for (const c of onTrack(clips, track)) {
      n++;
      const reel = (c.kind === "slug" ? "BL" : (c.take_id ?? c.audio_session_version_id ?? "AX").replace(/-/g, "").slice(0, REEL_MAX).toUpperCase()).padEnd(REEL_MAX);
      const chan = track === "V1" ? "V    " : "A    ";
      lines.push(`${String(n).padStart(3, "0")}  ${reel} ${chan} C        ${tc(c.source_in)} ${tc(c.source_in + c.duration)} ${tc(c.record_in, RECORD_START_HOUR)} ${tc(end(c), RECORD_START_HOUR)}`);
      lines.push(`* FROM CLIP NAME: ${c.label.replace(/[\r\n]+/g, " ")}`);
      if (c.kind === "slug") lines.push("* OFFLINE: no approved media yet");
      lines.push("");
    }
  }
  return { edl: lines.join("\n"), events: n, engine_version: ENGINE_VERSION };
}
