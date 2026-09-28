// engines/editorial/editDecisionEngine
// Applies one NLE operation to the timeline and returns the new clip list.
// Pieces created by a cut have id null; the caller assigns ids.
import { NEUTRAL_GRADE, type TimelineTrack } from "@aurastage/contracts";
import { end, onTrack, overlaps, sortClips, type EngineClip } from "../timeline";
import { SYNC_LOCKED_TRACKS } from "./rules";
import { EditRejectedError, validateEditDecisionInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { EditDecisionOutput } from "./output.schema";

const reject = (m: string): never => {
  throw new EditRejectedError(m);
};

/** Remove [a,b) from the given tracks and close the gap (sync-locked ripple delete). */
function removeRange(clips: EngineClip[], a: number, b: number, tracks: readonly TimelineTrack[]): EngineClip[] {
  const len = b - a;
  const out: EngineClip[] = [];
  for (const c of clips) {
    if (!tracks.includes(c.track)) {
      out.push(c);
      continue;
    }
    const e = end(c);
    if (e <= a) out.push(c);
    else if (c.record_in >= b) out.push({ ...c, record_in: c.record_in - len });
    else if (c.record_in >= a && e <= b) continue; // fully inside: removed
    else if (c.record_in < a && e > b) {
      out.push({ ...c, duration: a - c.record_in });
      out.push({ ...c, id: null, record_in: a, source_in: c.source_in + (b - c.record_in), duration: e - b });
    } else if (c.record_in < a) out.push({ ...c, duration: a - c.record_in });
    else out.push({ ...c, record_in: a, source_in: c.source_in + (b - c.record_in), duration: e - b });
  }
  return out;
}

/** Open a gap of d frames at `at` on the given tracks (splitting a clip that spans it). */
function insertGap(clips: EngineClip[], at: number, d: number, tracks: readonly TimelineTrack[]): EngineClip[] {
  const out: EngineClip[] = [];
  for (const c of clips) {
    if (!tracks.includes(c.track) || end(c) <= at) out.push(c);
    else if (c.record_in >= at) out.push({ ...c, record_in: c.record_in + d });
    else {
      out.push({ ...c, duration: at - c.record_in });
      out.push({ ...c, id: null, record_in: at + d, source_in: c.source_in + (at - c.record_in), duration: end(c) - at });
    }
  }
  return out;
}

/** Clear [a,b) on one track without moving anything (overwrite). */
const clearRange = (clips: EngineClip[], a: number, b: number, track: TimelineTrack) => {
  const cleared = removeRange(clips, a, b, [track]);
  // removeRange closed the gap; re-open it on this track only.
  return insertGap(cleared, a, b - a, [track]);
};

function check(clips: EngineClip[]) {
  for (const c of clips) {
    if (c.duration < 1) reject(`“${c.label}” would have no length left.`);
    if (c.record_in < 0) reject(`“${c.label}” would start before the beginning of the timeline.`);
    if (c.source_in < 0) reject(`“${c.label}” has no more media before its first frame.`);
    if (c.source_frames !== null && c.source_in + c.duration > c.source_frames) reject(`“${c.label}” has no more media after its last frame.`);
  }
  const o = overlaps(clips);
  if (o.length) reject(`“${o[0][1].label}” would overlap “${o[0][0].label}”.`);
  return clips;
}

export function editDecisionEngine(raw: unknown): EditDecisionOutput {
  const { clips: input, operation: op, new_clip, replacements } = validateEditDecisionInput(raw);
  let clips: EngineClip[] = input.map((c) => ({ ...c }));
  const find = (id: string) => clips.find((c) => c.id === id) ?? reject("That clip is no longer on the timeline — reload.");
  const all = SYNC_LOCKED_TRACKS;
  let summary = "";

  switch (op.op) {
    case "insert":
    case "overwrite": {
      if (!new_clip) return reject("Nothing to place.");
      const d = new_clip.duration;
      const placed = { ...new_clip, record_in: op.at };
      if (op.op === "insert") {
        clips = insertGap(clips, op.at, d, all);
        summary = `Inserted “${placed.label}” — everything after it moved ${d} frames later.`;
      } else {
        clips = clearRange(clips, op.at, op.at + d, placed.track);
        summary = `Overwrote ${d} frames with “${placed.label}”.`;
      }
      clips.push(placed);
      break;
    }
    case "blade": {
      const c = onTrack(clips, op.track).find((x) => x.record_in < op.at && end(x) > op.at) ?? reject("There's no clip under the playhead on that track to cut.");
      const e = end(c);
      c.duration = op.at - c.record_in;
      clips.push({ ...c, id: null, record_in: op.at, source_in: c.source_in + c.duration, duration: e - op.at });
      summary = `Cut “${c.label}” in two.`;
      break;
    }
    case "lift": {
      const c = find(op.clip_id);
      clips = clips.filter((x) => x !== c);
      summary = `Lifted “${c.label}” — a gap stays in its place.`;
      break;
    }
    case "extract": {
      const c = find(op.clip_id);
      clips = removeRange(clips, c.record_in, end(c), all);
      summary = `Extracted “${c.label}” — everything after it moved ${c.duration} frames earlier on all tracks.`;
      break;
    }
    case "trim": {
      const c = find(op.clip_id);
      const d = op.delta;
      if (d === 0) return reject("Nothing to trim.");
      if (!op.ripple) {
        if (op.edge === "out") c.duration += d;
        else Object.assign(c, { record_in: c.record_in + d, source_in: c.source_in + d, duration: c.duration - d });
        summary = `Trimmed the ${op.edge === "in" ? "start" : "end"} of “${c.label}” by ${d} frames.`;
        break;
      }
      if (op.edge === "out") {
        if (d < 0) clips = removeRange(clips, end(c) + d, end(c), all);
        else {
          if (c.source_frames !== null && c.source_in + c.duration + d > c.source_frames) return reject(`“${c.label}” has no more media after its last frame.`);
          const at = end(c);
          clips = insertGap(clips, at, d, all);
          c.duration += d;
        }
      } else {
        if (d > 0) {
          if (d >= c.duration) return reject(`“${c.label}” would have no length left.`);
          clips = removeRange(clips, c.record_in, c.record_in + d, all);
        } else {
          if (c.source_in + d < 0) return reject(`“${c.label}” has no more media before its first frame.`);
          const at = c.record_in;
          clips = insertGap(clips, at, -d, all);
          // insertGap moved the clip (a copy) right; pull its head back over the opened gap.
          Object.assign(find(op.clip_id), { record_in: at, source_in: c.source_in + d, duration: c.duration - d });
        }
      }
      summary = `Ripple-trimmed the ${op.edge === "in" ? "start" : "end"} of “${c.label}” by ${d} frames; later clips followed on all tracks.`;
      break;
    }
    case "roll": {
      const l = find(op.clip_id);
      const r = onTrack(clips, l.track).find((x) => x.record_in === end(l)) ?? reject(`“${l.label}” has no clip right after it to roll into.`);
      l.duration += op.delta;
      Object.assign(r, { record_in: r.record_in + op.delta, source_in: r.source_in + op.delta, duration: r.duration - op.delta });
      summary = `Rolled the cut between “${l.label}” and “${r.label}” by ${op.delta} frames.`;
      break;
    }
    case "slip": {
      const c = find(op.clip_id);
      if (c.kind === "slug") return reject("An offline slug has no media to slip.");
      if (c.source_frames === null) return reject(`“${c.label}” is a still image — there is nothing to slip.`);
      c.source_in += op.delta;
      summary = `Slipped “${c.label}” ${op.delta} frames (same place and length, different part of the take).`;
      break;
    }
    case "slide": {
      const c = find(op.clip_id);
      const list = onTrack(clips, c.track);
      const prev = list.find((x) => end(x) === c.record_in);
      const next = list.find((x) => x.record_in === end(c));
      if (prev) prev.duration += op.delta;
      if (next) Object.assign(next, { record_in: next.record_in + op.delta, source_in: next.source_in + op.delta, duration: next.duration - op.delta });
      c.record_in += op.delta;
      summary = `Slid “${c.label}” ${op.delta} frames between its neighbours.`;
      break;
    }
    case "move": {
      const c = find(op.clip_id);
      c.record_in = op.record_in;
      summary = `Moved “${c.label}”.`;
      break;
    }
    case "grade": {
      const c = find(op.clip_id);
      if (c.kind !== "take") return reject("Only picture clips can be graded.");
      c.grade = { ...NEUTRAL_GRADE, ...op.grade };
      summary = `Graded “${c.label}”.`;
      break;
    }
    case "conform": {
      const reps = replacements ?? [];
      if (!reps.length) return reject("Everything already uses the approved takes and mixes.");
      for (const r of reps) {
        const c = find(r.clip_id);
        Object.assign(c, { kind: r.kind, take_id: r.take_id, audio_session_version_id: r.audio_session_version_id, source_frames: r.source_frames, label: r.label });
        if (r.kind === "slug") c.source_in = 0;
        if (c.source_frames !== null && c.source_in + c.duration > c.source_frames) {
          c.source_in = Math.max(0, Math.min(c.source_in, c.source_frames - 1));
          c.duration = Math.max(1, c.source_frames - c.source_in);
        }
      }
      summary = `Updated ${reps.length} clip${reps.length === 1 ? "" : "s"} to the currently approved takes and mixes — the cut is unchanged.`;
      break;
    }
  }
  return { clips: sortClips(check(clips)), summary, engine_version: ENGINE_VERSION };
}
