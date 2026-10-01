// engines/story/storyScaffoldEngine
// Built-in story development and scene outline for Scriptwriter (owner, 2026-10-01: Scriptwriter fields must be filled
// by the platform's own engines, "advanced and capable of complex storylines"; only generation through a third party
// costs money). Free and deterministic; the result has the same shape as a model's (StoryDevelopmentOutput /
// OutlineOutput) and goes through the same checks, review, edit and apply — nothing changes on its own.
//
// Story: reads the brief (premise.ts), keeps every name the writer or Casting already decided, builds a character web —
// protagonist, antagonist, the B-story person who carries the theme, a mentor/ally, and everyone else the brief names —
// each with want, need, flaw, the lie they believe and an arc; picks a genre structure (structures.ts) with three
// threads (A goal, B relationship, C the antagonist's counter-plan), a plant early that pays off in the last act, and
// beats placed in minutes against the runtime. Anything the brief didn't say is listed as an assumption.
// Outline: sizes scenes to the runtime exactly, gives every beat its scenes (set-up → complication → turn), weaves the
// threads, reuses canonical places (from the brief, the characters' homes, the antagonist's base), chooses day/night by
// tension, and puts the right people in each scene (named in the beat; the protagonist carries A and B).
import { StoryBriefSchema, type StoryBrief } from "../storyDevelopmentEngine/input.schema";
import type { StoryDevelopmentOutput } from "../storyDevelopmentEngine/output.schema";
import { StoryContextSchema, type StoryContext, type OutlineOutput, type OutlineScene } from "../scriptWritingEngine/schemas";
import { storySetupEngine } from "../storySetupEngine";
import { readPremise, type PremisePerson } from "./premise";
import { bankFor, pickName } from "./names";
import { STRUCTURES, familyOf, cap, type Ctx, type Family } from "./structures";
import { ENGINE_VERSION } from "./version";

const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const first = (n: string) => n.trim().split(/\s+/)[0];
/** What the antagonist will do, from the obstacle sentence without their own name and description ("will kill to keep it buried"). */
const aims = (obstacle: string, name: string) => {
  const i = obstacle.indexOf(first(name));
  const rest = (i >= 0 ? obstacle.slice(i + first(name).length) : obstacle).replace(/^\s*[A-Z][a-z]+/, (m) => (i >= 0 && /^\s*[A-Z]/.test(m) && name.includes(m.trim()) ? "" : m)).replace(/^\s*,[^,]*,\s*/, "").trim();
  return rest && rest !== obstacle ? rest.replace(/[.]$/, "") : "";
};
const dot = (s: string) => (s ? (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`) : "");

const FLAWS = [
  { flaw: "distrust of everyone", need: "to let others in and share the risk", lie: "I can only rely on myself" },
  { flaw: "pride", need: "to admit what they got wrong", lie: "I'm never wrong about people" },
  { flaw: "recklessness", need: "to count what others pay for their choices", lie: "the ends justify the means" },
  { flaw: "fear of losing what's left", need: "to risk it to really live", lie: "if I hold on tight, nothing more can be taken" },
  { flaw: "silence", need: "to say the truth out loud", lie: "keeping quiet keeps people safe" },
  { flaw: "anger", need: "to turn anger into purpose", lie: "rage is what makes me strong" },
  { flaw: "guilt over the past", need: "to forgive themselves", lie: "I deserve whatever happens to me" },
];
const PLANTS: Record<Family, string[]> = {
  thriller: ["a battered notebook with one page torn out", "an old voice recording no one has heard", "a key nobody can place", "a photograph with one face scratched out", "a phone number written on a receipt"],
  romance: ["a letter that was never sent", "a song they both half-remember", "a borrowed jacket", "a photograph from a wedding long ago"],
  horror: ["a child's drawing of the house", "a locked door in the basement", "an old family Bible with names crossed out", "a music box that plays by itself"],
  comedy: ["a ridiculous lucky charm", "a misdelivered parcel", "an embarrassing old video", "a rented suit that must go back"],
  drama: ["a family photograph turned face down", "an unopened letter", "a father's watch that stopped", "a sketchbook no one is allowed to see"],
};
const DEFAULTS: Record<Family, { goal: string; stakes: string; inciting: string; obstacle: string; theme: string; tone: string }> = {
  thriller: { goal: "find the truth and make it public before it is buried", stakes: "lives and a whole community's future", inciting: "a piece of evidence lands where it shouldn't", obstacle: "the people behind it are powerful and will do anything to stay hidden", theme: "Truth and its price", tone: "Tense" },
  romance: { goal: "hold on to something real", stakes: "the chance of a life with someone", inciting: "two people who should never meet do", obstacle: "their worlds — and their pasts — pull them apart", theme: "Love and what it costs", tone: "Warm" },
  horror: { goal: "survive and break what has come for them", stakes: "their lives and the people they love", inciting: "something wakes that should have stayed asleep", obstacle: "no one believes them, and it is learning", theme: "Fear and the past", tone: "Suspenseful" },
  comedy: { goal: "pull off a plan that is far too big for them", stakes: "their pride, their job and their friendship", inciting: "a mistake snowballs into a disaster", obstacle: "everyone else wants the same thing", theme: "Being yourself", tone: "Playful" },
  drama: { goal: "hold the family together through what is coming", stakes: "the relationships that matter most", inciting: "news arrives that changes everything", obstacle: "the past and the people who won't let it go", theme: "Family and forgiveness", tone: "Intimate" },
};
// Words that paint someone as the threat. Honorifics alone ("Chief", "Alhaji", "Pastor") don't — they're respect, not villainy.
const VILLAIN = /\b(kingpin|warlord|cult|gang|rival|killer|murderer|tycoon|magnate|godfather|enemy|villain|demon|creature|corrupt|ruthless|kingmaker|tyrant|dictator|crime lord|trafficker|smuggler|predator|stalker|monster)\b/i;
const roleOf = (r: string | null | undefined): "protagonist" | "antagonist" | "supporting" | "minor" => {
  const x = (r ?? "").toLowerCase();
  return /protag|lead|hero/.test(x) ? "protagonist" : /antag|villain/.test(x) ? "antagonist" : /minor|extra/.test(x) ? "minor" : "supporting";
};

export interface StoryScaffoldResult { story: StoryDevelopmentOutput; structure: string; family: Family; engine_version: string }

export function storyScaffoldEngine(raw: StoryBrief): StoryScaffoldResult {
  const b = StoryBriefSchema.parse(raw);
  const text = [b.logline, b.synopsis, b.request].filter(Boolean).join(" ");
  const pr = readPremise(text);
  const seed = hash(`${b.title}|${text}`);
  const assumptions: string[] = [];

  // Genre, tone, setting, period: the writer's, else read from the premise (storySetupEngine), else the family default.
  const read = storySetupEngine({ title: b.title, headings: [], action: pr.sentences.slice(0, 200), emotions: [], leads: [], existing: { genre: b.genre, tone: b.tone, setting: b.setting, time_period: b.time_period }, year_now: 2026 });
  const genre = b.genre ?? read.story.genre ?? "Drama";
  const family = familyOf(`${genre} ${b.subgenre ?? ""}`);
  const D = DEFAULTS[family];
  const setting = b.setting ?? read.story.setting ?? null;
  const time_period = b.time_period ?? read.story.time_period ?? "Present day";
  const tone = b.tone ?? read.story.tone ?? D.tone;
  if (!b.genre) assumptions.push(`Genre: ${genre} (${read.evidence.genre ?? "from the brief"}).`);
  if (!b.setting) assumptions.push(setting ? `Setting: ${setting} (named in the brief).` : "Setting: not given — places are named generically; set one to ground the story.");
  const runtime = b.target_runtime_minutes ?? (b.type === "short_film" ? 15 : 100);
  if (!b.target_runtime_minutes) assumptions.push(`Runtime: ${runtime} minutes (none set).`);

  // ---- The character web ----
  const bank = bankFor(setting);
  type Person = { name: string; role: "protagonist" | "antagonist" | "supporting" | "minor"; age: number | null; description: string; name_reasoning: string; relation?: string | null; relation_to?: string | null; absent?: boolean };
  const people: Person[] = [];
  const has = (n: string) => people.some((p) => first(p.name).toLowerCase() === first(n).toLowerCase());
  for (const c of b.characters) if (!has(c.name)) people.push({ name: c.name, role: roleOf(c.role), age: null, description: c.description ?? "", name_reasoning: `Kept as decided (${c.source === "casting" ? "Casting" : c.source === "writer" ? "your story" : "the story so far"}).` });
  for (const p of pr.people) {
    const cur = people.find((x) => first(x.name).toLowerCase() === first(p.name).toLowerCase());
    if (cur) { cur.age ??= p.age; if (!cur.description && p.descriptor) cur.description = cap(p.descriptor); cur.relation ??= p.relation; cur.relation_to ??= p.relation_to; cur.absent ||= p.absent; continue; }
    const desc = [p.title, p.descriptor].filter(Boolean).join(", ");
    people.push({ name: p.name, role: "supporting", age: p.age, description: desc ? cap(desc) : "", name_reasoning: "Named in your brief.", relation: p.relation, relation_to: p.relation_to, absent: p.absent });
  }
  const invent = (role: Person["role"], description: string) => {
    const n = pickName(bank, people.map((p) => p.name), seed + people.length * 7);
    const p: Person = { name: n.name, role, age: null, description, name_reasoning: n.reasoning };
    people.push(p);
    assumptions.push(`${n.name} (${role}) was added and named by the built-in naming — rename freely.`);
    return p;
  };
  // Protagonist: the writer's lead, else the first person the brief describes, else a new one.
  let P = people.find((p) => p.role === "protagonist") ?? people.find((p) => !p.absent && !VILLAIN.test(`${p.description}`) && !p.relation) ?? people.find((p) => !p.absent && !VILLAIN.test(`${p.description}`));
  if (!P) P = invent("protagonist", `At the centre of the story${setting ? ` in ${setting}` : ""}.`);
  P.role = "protagonist";
  // Antagonist: the writer's, else the person the brief paints as the threat, else one shaped from the obstacle.
  let A = people.find((p) => p !== P && p.role === "antagonist") ?? people.find((p) => p !== P && VILLAIN.test(`${p.description} ${p.name}`));
  // In a drama or a romance the opposing force is usually someone already in the story (the estranged son, the rival
  // family) — the person who most resists what the hero wants — not a villain we invent.
  const intimate = family === "drama" || family === "romance";
  const named = people.filter((p) => p !== P && !p.absent && p.role !== "minor");
  let fromStory = false;
  if (!A && intimate && named.length) { A = named[0]; fromStory = true; assumptions.push(`${A.name} is the opposing force — the person who most resists what ${first(P.name)} wants (no villain in a ${genre.toLowerCase()}).`); }
  if (!A) A = invent("antagonist", cap(pr.obstacle ? `The force behind it: ${pr.obstacle}.` : `The one who stands in the way — ${D.obstacle}.`));
  A.role = "antagonist";
  // B-story: someone close to the protagonist (a relation the brief names), else another named person, else new.
  // The one who vanishes or is taken is what's at stake — the B-story is someone who can walk beside the hero.
  const X = people.find((p) => p !== P && p !== A && p.absent) ?? null;
  let B = people.find((p) => p !== P && p !== A && !p.absent && p.relation && (!p.relation_to || first(p.relation_to) === first(P.name))) ?? people.find((p) => p !== P && p !== A && !p.absent && p.role !== "minor");
  // When the opposing force is also the person closest to the hero, that relationship carries both threads.
  if (!B && fromStory) B = A;
  if (!B) B = invent("supporting", `Closest to ${first(P.name)}.`);
  let M = people.find((p) => p !== P && p !== A && p !== B && !p.absent && p.role !== "minor");
  // A short film doesn't gain a mentor it doesn't need: the closest person carries that voice too.
  if (!M && runtime <= 20) M = B;
  if (!M) M = invent("supporting", `${first(P.name)}'s mentor or ally: the voice of experience.`);

  const fl = FLAWS[seed % FLAWS.length];
  const plant = PLANTS[family][(seed >>> 3) % PLANTS[family].length];
  const c: Ctx = {
    P: first(P.name), A: first(A.name), B: first(B.name), M: first(M.name),
    goal: pr.goal ?? D.goal, obstacle: pr.obstacle ?? D.obstacle, stakes: pr.stakes ?? (X ? `${first(X.name)}'s life — and ${D.stakes}` : D.stakes), deadline: pr.deadline,
    inciting: pr.inciting ?? D.inciting, place: setting ?? "The city", flaw: fl.flaw, need: fl.need, theme: pr.themes[0] ?? D.theme, plant, lie: fl.lie,
  };
  if (!pr.goal) assumptions.push(`The goal wasn't stated — assumed: ${c.goal}.`);
  if (!pr.obstacle) assumptions.push(`What stands in the way wasn't stated — assumed: ${c.obstacle}.`);
  if (!pr.stakes) assumptions.push(`The stakes weren't stated — assumed: ${c.stakes}.`);
  if (X) assumptions.push(`${X.name} is what's at stake (gone in the premise); the B-story is carried by ${B.name}.`);

  const struct = STRUCTURES[family];
  // A short film keeps the essential beats only (about one per 2½ minutes, never fewer than three): evenly spread, always
  // the opening and the final image, and the plant's scene and its pay-off kept when there's room.
  const keep = Math.max(3, Math.round(runtime / 2.5));
  const defs = struct.beats.length <= keep ? struct.beats
    : [...new Set(Array.from({ length: keep }, (_, k) => Math.round((k * (struct.beats.length - 1)) / (keep - 1))))].map((k) => struct.beats[k]);
  if (defs.length < struct.beats.length) assumptions.push(`A ${runtime}-minute film keeps ${defs.length} of the ${struct.beats.length} beats.`);
  const beats = defs.map((d) => ({
    act: d.act, title: `${d.title}${d.thread === "B" ? " (B-story)" : d.thread === "C" ? ` (${c.A}'s plan)` : ""}`.slice(0, 120),
    summary: d.text(c).slice(0, 800), approx_minute: Math.min(600, Math.round(d.pct * runtime)),
  }));

  const rel = (p: Person) => (p.relation ? ` ${cap(p.relation)} of ${p.relation_to ? first(p.relation_to) : c.P}.` : "");
  const characters = people.slice(0, 24).map((p) => {
    const base = { name: p.name.slice(0, 80), role: p.role, age: p.age, name_reasoning: p.name_reasoning.slice(0, 400) };
    if (p === P) return { ...base, description: `${dot(p.description) || "The protagonist."} Flaw: ${fl.flaw}.`.slice(0, 800), want: c.goal.slice(0, 300), need: cap(fl.need).slice(0, 300), arc: `Believes "${fl.lie}"; the story breaks that belief at the all-is-lost moment and ${first(p.name)} ends having learned ${fl.need}.`.slice(0, 500) };
    if (p === A) return { ...base, description: (dot(p.description) || `The antagonist — ${c.obstacle}.`).slice(0, 800), want: `To win, whatever it takes${aims(c.obstacle, p.name) ? ` — ${aims(c.obstacle, p.name)}` : ""}`.slice(0, 300), need: "To be stopped — the one thing they will never choose", arc: `Runs a counter-plan that moves even when ${c.P} doesn't; from untouchable to exposed in the last act.`.slice(0, 500) };
    if (p === B) return { ...base, description: `${dot(p.description) || `Closest to ${c.P}.`}${rel(p)} Carries the B-story — the theme (${c.theme.toLowerCase()}) in a relationship.`.slice(0, 800), want: `To be trusted by ${c.P}`.slice(0, 300), need: `To stand up to ${c.P}, not just beside them`.slice(0, 300), arc: `Pushes back early, is drawn closer, breaks away when ${c.P}'s ${fl.flaw} costs too much, and returns changed for the climax.`.slice(0, 500) };
    if (p === M) return { ...base, description: `${dot(p.description) || `${c.P}'s ally.`}${rel(p)}`.slice(0, 800), want: `To keep ${c.P} from repeating an old mistake`.slice(0, 300), need: "To let go and trust the next generation", arc: `Warns ${c.P} at the start; their words come back in the dark night and turn the story.`.slice(0, 500) };
    if (p === X) return { ...base, description: `${dot(p.description) || "Gone at the start of the story."}${rel(p)} What's at stake: gone in the premise; finding them drives ${c.P}.`.slice(0, 800), want: "", need: "", arc: "Absent for most of the story; their fate is decided in the climax." };
    return { ...base, description: `${dot(p.description) || "Part of the story's world."}${rel(p)}`.slice(0, 800), want: "", need: "", arc: "" };
  });

  const logline = (b.logline && b.logline.length >= 10 ? b.logline : `${P.name}${P.description && P.description.length < 80 ? `, ${P.description.replace(/\.$/, "").replace(/^(a|an|the)\s/i, "").toLowerCase()},` : ""} must ${c.goal} — but ${c.obstacle}${c.deadline ? `, ${c.deadline}` : ""}.`).slice(0, 500);
  const acts = [1, 2, 3].map((a) => beats.filter((x) => x.act === a).map((x) => x.summary).join(" "));
  const synopsis = (b.synopsis && b.synopsis.length >= 50 ? b.synopsis : `${acts[0]}\n\n${acts[1]}\n\n${acts[2]}`).slice(0, 6000);
  const themes = [...new Set([c.theme, ...pr.themes, D.theme])].slice(0, 6);
  assumptions.push(`Structure: ${struct.name}.`, `Plant and pay-off: ${plant} — seen early, the key in the last act.`);

  return {
    story: {
      title_options: [b.title.slice(0, 120)], logline, synopsis, themes, genre: genre.slice(0, 100), tone: tone.slice(0, 100),
      setting: (setting ?? "To be decided").slice(0, 200), time_period: time_period.slice(0, 100),
      characters, beats, assumptions: assumptions.slice(0, 10).map((a) => a.slice(0, 300)),
    },
    structure: struct.name, family, engine_version: ENGINE_VERSION,
  };
}

// ---- The scene outline ----------------------------------------------------------------------------------------------
const OUTSIDE = /STREET|HARBOUR|MARKET|BEACH|FOREST|VILLAGE|FARM|DESERT|STADIUM|POLLING|ROAD|ROOFTOP|PARK|BRIDGE|YARD|COMPOUND|SQUARE|DOCKS|FIELD|CEMETERY|BOAT/;
const GENRE_PLACES: Record<Family, string[]> = {
  thriller: ["STREET", "PARKING GARAGE", "SAFE HOUSE", "ROOFTOP"], romance: ["CAFE", "STREET", "PARK"], horror: ["HOUSE - BASEMENT", "ROAD", "CEMETERY"],
  comedy: ["OFFICE", "STREET", "PARTY HALL"], drama: ["FAMILY HOME - KITCHEN", "HOSPITAL", "STREET"],
};

export function outlineScaffoldEngine(raw: StoryContext): { outline: OutlineOutput; engine_version: string } {
  const s = StoryContextSchema.parse(raw);
  const runtime = s.target_runtime_minutes ?? 100;
  const family = familyOf(s.genre);
  const notes: string[] = ["Built in (free): a full scene outline to build on — edit any scene, or ask the AI writer (paid) for a different take."];
  if (!s.target_runtime_minutes) notes.push(`Sized to ${runtime} minutes (no runtime set).`);
  // Beats: the story's, else the genre structure written from what the story knows.
  let beats = [...s.beats].sort((a, b) => a.approx_minute - b.approx_minute);
  if (!beats.length) {
    const dev = storyScaffoldEngine({ title: s.title, type: s.type, logline: s.logline, synopsis: s.synopsis, genre: s.genre, tone: s.tone, setting: s.setting, time_period: s.time_period,
      target_runtime_minutes: runtime, characters: s.characters.map((c) => ({ name: c.name, role: c.role, description: c.description || null, source: "story" as const })) });
    beats = dev.story.beats;
    notes.push("There were no story beats yet, so the outline follows the built-in structure for the genre.");
  }
  const chars = s.characters.length ? s.characters : [{ name: "PROTAGONIST", role: "protagonist", age: null, description: "", want: "", need: "", arc: "" }];
  const P = chars.find((c) => /protag|lead/i.test(c.role)) ?? chars[0];
  const A = chars.find((c) => /antag/i.test(c.role));
  const up = (n: string) => first(n).toUpperCase().replace(/[^A-Z0-9'&.,\- /]/g, "");
  const brief = `${s.logline ?? ""} ${s.synopsis ?? ""}`;
  const places = [...new Set([...readPremise(brief).places, ...GENRE_PLACES[family]])];
  const homeP = `${up(P.name)}'S HOME`;
  const baseA = A ? `${up(A.name)}'S ${family === "thriller" ? "OFFICE" : "HOUSE"}` : places[1] ?? "OFFICE";
  const avg = runtime <= 20 ? 1.5 : runtime <= 60 ? 2 : 2.6;
  const scenes: OutlineScene[] = [];
  const nameIn = (text: string) => chars.filter((c) => new RegExp(`\\b${first(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)).map((c) => c.name);
  let rot = 0;
  beats.forEach((bt, i) => {
    const end = i + 1 < beats.length ? beats[i + 1].approx_minute : runtime;
    const dur = Math.max(0.5, end - bt.approx_minute);
    const n = Math.max(1, Math.min(12, Math.round(dur / avg)));
    // Sentences of the beat, short ones ("Lagos, Nigeria.") joined to the next so no scene is a fragment.
    const sentences: string[] = [];
    for (const x of bt.summary.split(/(?<=[.!?])\s+/).filter(Boolean)) {
      if (sentences.length && sentences[sentences.length - 1].length < 40) sentences[sentences.length - 1] += ` ${x}`; else sentences.push(x);
    }
    const thread = /\(B-story\)/.test(bt.title) ? "B" : /'s plan\)/.test(bt.title) ? "C" : "A";
    const night = /night|dark|confront|all is lost|taken|escalation|first sign|counter-move|machine/i.test(bt.title);
    for (let k = 0; k < n; k++) {
      const phase = n === 1 ? "" : k === 0 ? "Set-up" : k === n - 1 ? "Turn" : "Complication";
      // Each scene takes its share of the beat; when the beat has fewer sentences than scenes, the extra scenes move the
      // thread on (the hero presses, the relationship shows, the antagonist closes a door) instead of repeating it.
      const fresh = k < sentences.length && (n <= sentences.length || k === 0 || k === n - 1);
      const sentence = fresh ? sentences[n <= sentences.length ? Math.floor((k * sentences.length) / n) : k === n - 1 ? sentences.length - 1 : 0]
        : k === n - 1 ? sentences[sentences.length - 1]
        : thread === "B" ? `${first(P.name)} and the person closest to them — the tension between them shows in a small, telling moment.`
        : thread === "C" ? `${A ? first(A.name) : "The opposition"}'s people close another door; ${first(P.name)} doesn't know it yet.`
        : `${first(P.name)} presses on; what ${first(P.name)} learns here raises the stakes and forces a change of plan.`;
      const extra = "";
      let location: string;
      if (i === 0 && k === 0) location = places[0] && thread === "A" && /work|office|newsroom|market|harbour/i.test(places[0]) ? places[0] : homeP;
      else if (thread === "C") location = k % 2 === 0 ? baseA : places[(rot++) % places.length];
      else if (thread === "B") location = k % 2 === 0 ? homeP : places[(rot++) % places.length];
      else location = places[(rot++) % places.length] ?? homeP;
      const who = new Set(nameIn(bt.summary));
      if (thread !== "C") who.add(P.name);
      if (thread === "C" && A) who.add(A.name);
      // Everyone else gets their moments: one supporting person joins each A-story scene in turn.
      const others = chars.filter((c) => c !== P && c !== A && !who.has(c.name));
      if (thread === "A" && others.length) who.add(others[(scenes.length) % others.length].name);
      scenes.push({
        number: scenes.length + 1, int_ext: OUTSIDE.test(location) ? "EXT" : "INT", location: location.slice(0, 120),
        time_of_day: night ? "NIGHT" : i === 0 && k === 0 ? "MORNING" : k === n - 1 && n > 2 ? "EVENING" : "DAY",
        purpose: `${phase ? `${phase} — ` : ""}${bt.title}`.slice(0, 300), beat: bt.title.slice(0, 120),
        summary: `${phase ? `${phase}: ` : ""}${sentence}${extra}`.slice(0, 1200), characters: [...who].slice(0, 20), est_minutes: Math.max(0.2, Math.min(20, Math.round((dur / n) * 10) / 10)),
      });
    }
  });
  // The lengths add up to the runtime exactly (the last scene takes the rounding).
  // Every main character is on screen somewhere: one missing from every scene joins the climax (the last act's
  // confrontation, else the last scene before the final image).
  for (const c of chars.filter((x) => /protag|antag|lead/i.test(x.role))) {
    if (scenes.some((x) => x.characters.includes(c.name))) continue;
    const climax = [...scenes].reverse().find((x) => /confront|climax/i.test(x.beat)) ?? scenes[Math.max(0, scenes.length - 2)];
    if (climax.characters.length < 20) climax.characters.push(c.name);
  }
  // Spread the rounding over the scenes (longest first), keeping each between 0.2 and 20 minutes.
  for (let guard = 0; guard < 2000; guard++) {
    const diff = Math.round((runtime - scenes.reduce((a, x) => a + x.est_minutes, 0)) * 10) / 10;
    if (Math.abs(diff) < 0.05) break;
    const step = diff > 0 ? 0.1 : -0.1;
    const order = [...scenes].sort((a, b) => (diff > 0 ? a.est_minutes - b.est_minutes : b.est_minutes - a.est_minutes));
    const s2 = order.find((x) => (diff > 0 ? x.est_minutes < 20 : x.est_minutes > 0.2));
    if (!s2) break;
    s2.est_minutes = Math.round((s2.est_minutes + (Math.abs(diff) >= 1 ? Math.trunc(diff) : step)) * 10) / 10;
    s2.est_minutes = Math.max(0.2, Math.min(20, s2.est_minutes));
  }
  notes.push(`${scenes.length} scenes over ${beats.length} beats; ${new Set(scenes.map((x) => x.location)).size} places, reused where the story returns.`);
  return { outline: { scenes: scenes.slice(0, 400), notes: notes.slice(0, 10).map((x) => x.slice(0, 300)) }, engine_version: ENGINE_VERSION };
}
