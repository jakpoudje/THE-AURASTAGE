// apps/api/src/modules/audio/audio.readiness.ts
// Readiness is a predicate list with evidence (CLAUDE.md rule 12) — never a percentage.
import { FAMILY_BUS, LOUDNESS_STANDARDS, loudnessTarget } from "@aurastage/contracts";
import type { AudioFamily, LoudnessStandard, ReadinessPredicate } from "@aurastage/contracts";

type Row = Record<string, any>;

/** `standard` comes from Project Settings (technical.loudness_standard); EBU R128 when none is set. */
export function audioReadiness(
  session: Row, tracks: Row[], clips: Row[], measurement: Row | null, standard: LoudnessStandard = "ebu_r128",
  /** When a recording on this mix last got a new version in the Assets Library (the revision doesn't change then). */
  recordingsChangedAt: string | null = null
): { readiness: ReadinessPredicate[]; ready: boolean } {
  const LOUDNESS_TARGET = loudnessTarget(standard);
  const standardName = LOUDNESS_STANDARDS[standard].label.split(" (")[0];
  const family = new Map(tracks.map((t) => [t.id as string, t.family as AudioFamily]));
  const dialogueClips = clips.filter((c) => FAMILY_BUS[family.get(c.track_id) ?? "FX"] === "DX");
  const dxCues = dialogueClips.filter((c) => c.kind === "cue");
  const otherCues = clips.filter((c) => c.kind === "cue" && FAMILY_BUS[family.get(c.track_id) ?? "FX"] !== "DX");
  const replacedAfter = !!measurement && !!recordingsChangedAt && Date.parse(recordingsChangedAt) > Date.parse(measurement.measured_at);
  const current = !!measurement && measurement.session_revision === session.revision && !replacedAfter;
  const I = measurement?.integrated_lufs === null || measurement?.integrated_lufs === undefined ? null : Number(measurement.integrated_lufs);
  const TP = measurement?.true_peak_dbtp === null || measurement?.true_peak_dbtp === undefined ? null : Number(measurement.true_peak_dbtp);
  const readiness: ReadinessPredicate[] = [
    {
      id: "has_audio",
      label: "The mix contains real audio",
      ok: clips.some((c) => c.kind === "asset"),
      blocking: true,
      evidence: `${clips.filter((c) => c.kind === "asset").length} recordings placed`,
    },
    {
      id: "dialogue_recorded",
      label: "Every dialogue cue has a recording",
      ok: dxCues.length === 0,
      blocking: true,
      evidence: dialogueClips.length ? `${dialogueClips.length - dxCues.length} of ${dialogueClips.length} dialogue clips recorded` : "No dialogue in this scene",
    },
    {
      id: "measured",
      label: "Loudness measured after the last change",
      ok: current,
      blocking: true,
      evidence: !measurement ? "Not measured yet" : current ? `Measured ${new Date(measurement.measured_at).toLocaleString("en-GB")}` : replacedAfter ? "A recording was replaced in the Assets Library after the last measurement" : "The mix changed after the last measurement",
    },
    {
      id: "loudness_target",
      label: `Integrated loudness ${LOUDNESS_TARGET.integrated_lufs} LUFS ±${LOUDNESS_TARGET.tolerance_lu} (${standardName})`,
      ok: current && I !== null && Math.abs(I - LOUDNESS_TARGET.integrated_lufs) <= LOUDNESS_TARGET.tolerance_lu,
      blocking: false,
      evidence: current ? (I === null ? "Silent mix — no loudness" : `${I.toFixed(1)} LUFS`) : "Measure the current mix",
    },
    {
      id: "true_peak",
      label: `True peak at or below ${LOUDNESS_TARGET.max_true_peak_dbtp} dBTP`,
      ok: current && TP !== null && TP <= LOUDNESS_TARGET.max_true_peak_dbtp,
      blocking: false,
      evidence: current ? (TP === null ? "No signal" : `${TP.toFixed(1)} dBTP`) : "Measure the current mix",
    },
    {
      id: "cues_filled",
      label: "Planned effects, ambience and music have sound",
      ok: otherCues.length === 0,
      blocking: false,
      evidence: otherCues.length ? `Still planned: ${otherCues.slice(0, 4).map((c) => c.label).join("; ")}${otherCues.length > 4 ? "…" : ""}` : "All filled",
    },
  ];
  return { readiness, ready: readiness.filter((r) => r.blocking).every((r) => r.ok) };
}
