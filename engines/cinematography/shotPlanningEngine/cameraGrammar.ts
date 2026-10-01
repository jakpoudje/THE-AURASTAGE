// engines/cinematography/shotPlanningEngine/cameraGrammar.ts
// Camera intelligence by genre and by scene (shotPlanningEngine 1.3.0, owner request 2026-10-01).
// The coverage structure (establishing, master, singles, reactions, action) never changes — every line and every
// second of story time stays covered. This pass only chooses HOW each shot is filmed: angle, lens, focus, movement
// and support, from (1) the film's genre and (2) what kind of moment the scene is (a chase, a fight, suspense,
// intimacy, grief, a reveal, comedy). Each choice is written into the shot's rationale so a person can see why.
import type { ProposedShot } from "./output.schema";

export type GenreFamily = "thriller" | "horror" | "romance" | "comedy" | "action" | "epic" | "realism" | "war" | "drama";
export type SceneKind = "chase" | "fight" | "suspense" | "intimate" | "grief" | "reveal" | "comic" | "celebration" | "talk";

const GENRES: [GenreFamily, RegExp][] = [
  ["horror", /horror|slasher|supernatural|haunt|ghost|occult|zombie/i],
  ["thriller", /thriller|crime|mystery|noir|suspense|heist|detective|political|espionage|spy|conspiracy/i],
  ["action", /action|adventure|martial|superhero|disaster/i],
  ["war", /\bwar\b|military|combat/i],
  ["epic", /sci[\s-]?fi|science fiction|fantasy|epic|historical|period|space|myth/i],
  ["romance", /romance|romantic|love story|rom[\s-]?com/i],
  ["comedy", /comedy|comedic|satire|parody|farce|sitcom/i],
  ["realism", /documentary|docudrama|mockumentary|found footage|social realis|verit/i],
];

/** The film's genre family from the project's genre/subgenre text ("Political thriller" → thriller). Rom-com counts as romance with comic timing. */
export function genreFamily(genre: string | null | undefined): GenreFamily {
  if (!genre?.trim()) return "drama";
  return GENRES.find(([, re]) => re.test(genre))?.[0] ?? "drama";
}

const KINDS: [SceneKind, RegExp][] = [
  ["chase", /\b(chase[sd]?|chasing|pursu\w*|flee\w*|fled|escape[sd]?|run(s|ning)? (for|after|from)|sprint\w*|getaway|speeding)\b/i],
  ["fight", /\b(fight\w*|punch\w*|brawl\w*|struggle[sd]?|attack\w*|stab\w*|shoot(s|ing|out)?|gunfire|wrestl\w*|ambush\w*|battle\w*)\b/i],
  ["reveal", /\b(reveal\w*|discover\w*|realis\w*|realiz\w*|truth|confess\w*|it was you|betray\w*|twist)\b/i],
  ["grief", /\b(grief|griev\w*|mourn\w*|funeral|burial|dead|death|dies|died|loss|weep\w*|sob\w*)\b/i],
  ["intimate", /\b(kiss\w*|love you|tender\w*|intimate|embrace[sd]?|hold(s|ing)? hands|romantic|whisper\w*)\b/i],
  ["suspense", /\b(tense|tension|uneasy|menac\w*|threat\w*|dread|fear\w*|creep\w*|lurk\w*|watch(ed|ing)? from|hiding|silence|footsteps)\b/i],
  ["celebration", /\b(celebrat\w*|party|wedding|dance[sd]?|dancing|cheer\w*|festival|feast)\b/i],
  ["comic", /\b(funny|joke[sd]?|laugh\w*|comic\w*|absurd|awkward|prank\w*)\b/i],
];

/** What kind of moment the scene is, from its mood, purpose/atmosphere and dialogue. First strong cue wins, in the order above. */
export function sceneKind(cues: { mood: string[]; text: string[] }): { kind: SceneKind; cue: string | null } {
  const hay = [...cues.mood, ...cues.text].filter(Boolean).join(" \n ");
  for (const [k, re] of KINDS) {
    const m = hay.match(re);
    if (m) return { kind: k, cue: m[0].toLowerCase() };
  }
  return { kind: "talk", cue: null };
}

type Shot = ProposedShot;
type Rule = { why: string; apply: (s: Shot, peak: number | null, exterior: boolean) => Partial<Shot> | null };

const isSingle = (s: Shot) => s.purpose === "dialogue" || s.purpose === "reaction";
const isWide = (s: Shot) => s.purpose === "establishing" || s.purpose === "master" || s.purpose === "action";
const lensUp = (mm: number | null, by: number) => (mm === null ? null : Math.min(135, mm + by));
const lensDown = (mm: number | null, by: number) => (mm === null ? null : Math.max(14, mm - by));

/** Genre grammar: the film's overall camera language. */
const GENRE_RULES: Record<GenreFamily, Rule[]> = {
  drama: [],
  thriller: [
    { why: "low angle on the speaker at the height of the threat", apply: (s, p) => (s.purpose === "dialogue" && p !== null && p >= 7 ? { angle: p >= 9 ? "dutch" : "low" } : null) },
    { why: "longer lens compresses the space and closes the walls in", apply: (s) => (isSingle(s) ? { lens_mm: lensUp(s.lens_mm, 15) } : null) },
    { why: "the listener seen from above, exposed", apply: (s) => (s.purpose === "reaction" ? { angle: "high" } : null) },
  ],
  horror: [
    { why: "locked-off wide with negative space — something could be anywhere in the frame", apply: (s) => (s.purpose === "establishing" || s.purpose === "master" ? { movement: "static", support: "tripod", lens_mm: lensDown(s.lens_mm, 6), focus: "deep" } : null) },
    { why: "a slow creep in on the face", apply: (s, p) => (isSingle(s) && (p ?? 0) >= 6 ? { movement: "push_in", support: "dolly" } : null) },
    { why: "the frightened listener from above, small and vulnerable", apply: (s) => (s.purpose === "reaction" ? { angle: "high" } : null) },
  ],
  romance: [
    { why: "long lens and shallow focus isolate the two of them", apply: (s) => (isSingle(s) ? { focus: "shallow", lens_mm: Math.max(s.lens_mm ?? 85, 85) } : null) },
    { why: "a slow arc around them keeps the moment alive", apply: (s) => (s.purpose === "master" ? { movement: "arc", support: "dolly" } : null) },
  ],
  comedy: [
    { why: "the camera holds still and wide enough for timing and reactions to land in the same frame", apply: (s) => (s.purpose === "dialogue" || isWide(s) ? { movement: "static", support: "tripod", focus: "deep" } : null) },
    { why: "comedy plays wider — never tighter than a medium for the set-up", apply: (s, p) => (s.purpose === "dialogue" && (p ?? 0) < 8 && (s.size === "MCU" || s.size === "CU") ? { size: "MS", lens_mm: 40 } : null) },
  ],
  action: [
    { why: "the camera travels with the action", apply: (s) => (isWide(s) && s.purpose !== "establishing" ? { movement: "tracking", support: "gimbal" } : null) },
    { why: "wider lens up close keeps energy and space in the frame", apply: (s) => (isSingle(s) ? { lens_mm: lensDown(s.lens_mm, 15) } : null) },
  ],
  war: [
    { why: "handheld, in among it", apply: (s) => (s.purpose !== "establishing" ? { movement: "handheld", support: "handheld" } : null) },
    { why: "wide lens close in, nowhere to hide", apply: (s) => (isSingle(s) ? { lens_mm: lensDown(s.lens_mm, 20) } : null) },
  ],
  epic: [
    { why: "scale first — the world opens from above", apply: (s, _p, ext) => (s.purpose === "establishing" ? (ext ? { movement: "drone", support: "drone", angle: "aerial", size: "EWS", lens_mm: 18 } : { movement: "crane", support: "crane", angle: "high" }) : null) },
  ],
  realism: [
    { why: "observational handheld with natural focus, as if the camera were simply there", apply: (s) => ({ movement: "handheld", support: "shoulder", focus: "deep" }) },
  ],
};

/** Scene grammar: what this particular moment needs, on top of the genre. */
const SCENE_RULES: Record<SceneKind, Rule[]> = {
  talk: [],
  chase: [
    { why: "a chase: the wide shots run with them", apply: (s, _p, ext) => (isWide(s) && s.purpose !== "establishing" ? { movement: "tracking", support: ext ? "vehicle" : "steadicam" } : null) },
    { why: "a chase: handheld singles, breathless", apply: (s) => (isSingle(s) ? { movement: "handheld", support: "handheld" } : null) },
  ],
  fight: [
    { why: "a fight: handheld and wide enough to read every blow", apply: (s) => (s.purpose !== "establishing" ? { movement: "handheld", support: "handheld", lens_mm: isSingle(s) ? lensDown(s.lens_mm, 15) : s.lens_mm } : null) },
  ],
  suspense: [
    { why: "suspense: a slow push in as the tension builds", apply: (s, p) => (s.purpose === "dialogue" && (p ?? 0) >= 5 ? { movement: "push_in", support: "dolly" } : null) },
    { why: "suspense: hold the wide still and let the audience search the frame", apply: (s) => (s.purpose === "establishing" || s.purpose === "master" ? { movement: "static", support: "tripod" } : null) },
  ],
  intimate: [
    { why: "an intimate moment: shallow focus, the world falls away", apply: (s) => (isSingle(s) ? { focus: "shallow" } : null) },
  ],
  grief: [
    { why: "grief: the camera keeps still and a respectful distance on a long lens", apply: (s) => (isSingle(s) ? { movement: "static", support: "tripod", focus: "shallow", lens_mm: lensUp(s.lens_mm, 20) } : null) },
  ],
  reveal: [
    { why: "a reveal: the camera pushes in on the face that learns it", apply: (s) => (s.purpose === "reaction" ? { movement: "push_in", support: "dolly", size: "CU" } : null) },
    { why: "a reveal: rack focus to what changes everything", apply: (s, p) => (s.purpose === "dialogue" && (p ?? 0) >= 8 ? { focus: "rack_focus" } : null) },
  ],
  comic: [
    { why: "a comic beat: hold the two-shot so the reaction lands in frame", apply: (s) => (s.purpose === "master" ? { movement: "static", support: "tripod" } : null) },
  ],
  celebration: [
    { why: "a celebration: the camera moves through the room with the people", apply: (s) => (isWide(s) && s.purpose !== "establishing" ? { movement: "steadicam", support: "steadicam" } : null) },
  ],
};

const GENRE_LABEL: Record<GenreFamily, string> = {
  drama: "Drama", thriller: "Thriller", horror: "Horror", romance: "Romance", comedy: "Comedy", action: "Action", war: "War", epic: "Epic", realism: "Realist",
};

/**
 * Applies genre then scene grammar to every shot. Returns the shots (same order, same story time, same lines and
 * characters) with camera choices adjusted, and a short summary of what was decided and why.
 */
export function applyCameraGrammar(shots: Shot[], ctx: { genre: string | null; mood: string[]; text: string[]; exterior: boolean; peaks: Map<Shot, number | null>;
  /** The person chose how the camera moves (a coverage style, or calm/frenetic camera energy): keep movement, adjust only angle, lens and focus. */
  keepMovement?: boolean }) {
  const family = genreFamily(ctx.genre);
  const { kind, cue } = sceneKind({ mood: ctx.mood, text: ctx.text });
  const rules = [...GENRE_RULES[family].map((r) => ({ ...r, label: `${GENRE_LABEL[family]} grammar` })), ...SCENE_RULES[kind].map((r) => ({ ...r, label: "This scene" }))];
  const used = new Set<string>();
  const out = shots.map((s) => {
    let cur = { ...s };
    const whys: string[] = [];
    for (const r of rules) {
      let change = r.apply(cur, ctx.peaks.get(s) ?? null, ctx.exterior);
      if (change && ctx.keepMovement) {
        const { movement: _m, support: _s, ...rest } = change;
        change = Object.keys(rest).length ? rest : null;
      }
      if (!change) continue;
      const changed = Object.entries(change).some(([k, v]) => (cur as Record<string, unknown>)[k] !== v);
      if (!changed) continue;
      cur = { ...cur, ...change };
      whys.push(r.why);
      used.add(`${r.label}: ${r.why}`);
    }
    if (whys.length) cur.rationale = `${cur.rationale} Camera — ${whys.join("; ")}.`;
    return cur;
  });
  return { shots: out, camera: { genre_family: family, scene_kind: kind, cue, decisions: [...used] } };
}
