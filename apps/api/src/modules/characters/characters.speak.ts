// apps/api/src/modules/characters/characters.speak.ts
// "See them speak" (owner request 2026-10-02: "including the ability to animate their speech"). The character drawn by
// AuraSketch 3 in the film's genre style, with a mouth that speaks one of their lines (visemes) and natural blinks,
// timed to the line's real voice clip when Audio Studio has one (else estimated from the words and pace). Reads
// dialogue lines, audio clips and assets read-only; Casting owns nothing new here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { blinksFor, drawAuraSketchFigure, estimateLineSeconds, sketchStyleFor, visemesFor } from "@aurastage/engines";
import type { SketchAngle, SketchSize } from "@aurastage/engines";
import { lookFor } from "./characters.look";
import { mapDbError } from "./characters.repository";
import { CharacterValidationError } from "./characters.validator";

type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function rows(q: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}

export async function getCharacterSpeech(db: SupabaseClient, characterId: string, query: Record<string, string | undefined>) {
  const { c, appearance, genre } = await lookFor(db, characterId, null, null);
  const lines = await rows(db.from("dialogue_lines").select("id, scene_number, ordinal, text, emotion, intensity")
    .eq("character_id", c.id).neq("status", "removed").order("scene_number", { ascending: true }).order("ordinal", { ascending: true }).limit(300));
  const ids = lines.map((l) => l.id as string);
  // The voice made for each line in Audio Studio (a placed recording whose source names the line), if any.
  const voices = ids.length ? await rows(db.from("audio_clips").select("asset_id, duration_seconds, source").eq("project_id", c.project_id)
    .eq("kind", "asset").not("asset_id", "is", null).in("source->>dialogue_line_id", ids)) : [];
  const voiceFor = new Map<string, Row>();
  for (const v of voices) { const k = v.source?.dialogue_line_id; if (k && !voiceFor.has(k)) voiceFor.set(k, v); }
  const style = sketchStyleFor(genre);
  const base = {
    character: { id: c.id, name: c.name },
    style: { id: style.id, label: style.label },
    lines: lines.map((l) => ({ id: l.id, scene_number: l.scene_number, text: l.text, has_voice: voiceFor.has(l.id) })),
  };
  const lineId = query.line_id;
  if (!lineId) return base;
  if (!UUID.test(lineId)) throw new CharacterValidationError([], "Choose one of this character's lines.");
  const line = lines.find((l) => l.id === lineId);
  if (!line) throw new CharacterValidationError([], "That line isn't spoken by this character.");
  const v = voiceFor.get(lineId);
  let seconds = Number(v?.duration_seconds) || 0, timedBy: "voice" | "estimate" = "voice";
  if (!seconds) { seconds = estimateLineSeconds(String(line.text)); timedBy = "estimate"; }
  const angle = (["front", "three_quarter", "profile"].includes(query.angle ?? "") ? query.angle : "front") as SketchAngle;
  const size = (["CU", "MCU", "MS"].includes(query.size ?? "") ? query.size : "CU") as SketchSize;
  const track = visemesFor(String(line.text), seconds);
  const W = 640, H = 640;
  const fig = drawAuraSketchFigure(appearance, angle, size, { x: 0, y: 0, width: W, height: H }, {
    style, mouth: { kind: "talking", track, seconds, blinks: blinksFor(seconds + 1.2) },
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${style.paper}"/>${fig.svg}</svg>`;
  return {
    ...base,
    line: { id: line.id, scene_number: line.scene_number, text: line.text, emotion: line.emotion ?? null },
    svg, seconds, timed_by: timedBy, voice_asset_id: v?.asset_id ?? null, mouth_shapes: track.length, engine_version: fig.engine_version,
  };
}
