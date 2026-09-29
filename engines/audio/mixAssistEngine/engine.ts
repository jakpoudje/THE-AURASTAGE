// engines/audio/mixAssistEngine — two things a re-recording mixer does on every scene, done from the evidence:
// 1) duck music / ambience under dialogue: volume automation that dips while anyone speaks (from the real dialogue clip
//    positions) and recovers between lines; 2) reach the loudness target: the master gain change needed to move the
//    MEASURED integrated loudness onto the target, with what it does to the true peak (and whether the limiter catches it).
// Pure; the person applies the result (it becomes normal automation / a master gain they can edit).
import { ENGINE_VERSION } from "./version";

export interface Region { start: number; end: number }
export interface AutomationPoint { t: number; db: number }

/** Merges overlapping or near-touching dialogue so the music doesn't pump between quick lines. */
export function mergeRegions(regions: Region[], gap: number) {
  const sorted = regions.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Region[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start - last.end <= gap) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function duckUnderDialogue(input: { dialogue: Region[]; scene_seconds: number; depth_db?: number; attack_s?: number; release_s?: number; merge_gap_s?: number }) {
  const depth = -Math.abs(input.depth_db ?? 10), attack = input.attack_s ?? 0.25, release = input.release_s ?? 0.6;
  const regions = mergeRegions(input.dialogue, input.merge_gap_s ?? 1.0);
  const pts: AutomationPoint[] = [];
  const r2 = (x: number) => Math.round(Math.max(0, Math.min(input.scene_seconds, x)) * 100) / 100;
  for (const r of regions) {
    pts.push({ t: r2(r.start - attack), db: 0 }, { t: r2(r.start), db: depth }, { t: r2(r.end), db: depth }, { t: r2(r.end + release), db: 0 });
  }
  // Keep points in time order, one per instant (a later point at the same time wins).
  const byT = new Map<number, number>();
  for (const p of pts) byT.set(p.t, p.db);
  const automation = [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([t, db]) => ({ t, db }));
  return {
    automation, regions, depth_db: depth, engine_version: ENGINE_VERSION,
    summary: regions.length ? `Dips ${Math.abs(depth)} dB under ${regions.length} stretch${regions.length === 1 ? "" : "es"} of dialogue (${attack}s in, ${release}s out).` : "No recorded dialogue in this scene yet — nothing to duck under.",
  };
}

export function loudnessCorrection(input: { measured_lufs: number; true_peak_dbtp: number; target_lufs: number; max_true_peak_dbtp: number; current_master_db: number; limiter: boolean; ceiling_db: number }) {
  const delta = Math.round((input.target_lufs - input.measured_lufs) * 10) / 10;
  const master = Math.round(Math.max(-24, Math.min(24, input.current_master_db + delta)) * 10) / 10;
  const applied = Math.round((master - input.current_master_db) * 10) / 10;
  const peak = Math.round((input.true_peak_dbtp + applied) * 10) / 10;
  const limited = input.limiter && peak > input.ceiling_db;
  const note = Math.abs(applied) < 0.1 ? "Already on target." :
    `${applied > 0 ? "Raise" : "Lower"} the master by ${Math.abs(applied)} dB (${input.measured_lufs} → ${Math.round((input.measured_lufs + applied) * 10) / 10} LUFS).` +
    (peak > input.max_true_peak_dbtp ? limited ? ` Peaks would reach ${peak} dBTP; the master limiter holds them at ${input.ceiling_db} dB.` : ` Peaks would reach ${peak} dBTP — over the ${input.max_true_peak_dbtp} dBTP limit; switch the master limiter on.` : "") +
    " Measure again to confirm.";
  return { master_gain_db: master, change_db: applied, predicted_true_peak_dbtp: peak, over_peak_limit: peak > input.max_true_peak_dbtp && !limited, note, engine_version: ENGINE_VERSION };
}
