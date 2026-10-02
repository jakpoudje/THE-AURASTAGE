// engines/character/characterProfileEngine
// Built-in story intelligence (owner, 2026-09-30: "the engines we built should make these decisions… we just need a
// click"). Proposes a whole Casting profile from what the script shows about the character — the introduction, the
// action that names them, every line they speak and how they speak it, where and when they appear, their relationships
// and the story setup. Deterministic and free. Nothing comes from the character's name: age, gender and occupation only
// from the script's own words; accent and languages from the story (storyAccentEngine), never from a name.
import { CharacterProfileInputSchema, type CharacterProfileOutput } from "./schema";
import { ENGINE_VERSION } from "./version";

type E = string;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quote = (s: string, n = 90) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
/** Words that describe how a body moves or a habit of the hands, face or voice. */
const MOVE_RE = /\b(walks?|walking|limps?|limping|paces|pacing|strides?|shuffles?|leans?|slumps?|hunche[sd]|hunched|straightens|fidget\w*|taps?|tapping|drums? (?:his|her|their) fingers|rubs?|scratch\w*|nods?|shrugs?|cross(?:es)? (?:his|her|their) arms|folds? (?:his|her|their) arms|glances?|stares?|squints?|clench\w*|grips?|clutch\w*|wipes?|adjusts?|fiddles?|bites? (?:his|her|their) (?:lip|nails)|sighs?|tilts?|gestur\w*|points?|waves?|chews?|hums?|whistles?|sways?|hobbles?|struts?|creeps?|tiptoes?|swagger\w*|lumbers?|darts?|freezes|flinch\w*|trembl\w*|shak(?:es|ing)|smok(?:es|ing)|touches (?:his|her|their))\b/i;
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

const TRAITS: Record<E, [string, string]> = {
  anger: ["quick-tempered", "forceful"], determination: ["resolute", "driven"], fear: ["guarded", "anxious"], tension: ["watchful", "careful"],
  joy: ["warm", "buoyant"], sadness: ["wounded", "reflective"], love: ["affectionate", "protective"], contempt: ["scornful", "proud"],
  trust: ["open", "loyal"], resignation: ["weary", "pragmatic"], anticipation: ["eager", "curious"], surprise: ["reactive", "easily unsettled"],
  disgust: ["principled", "exacting"], neutral: ["measured", "reserved"],
};
const STRENGTH: Record<E, string> = {
  determination: "Won't back down once they've decided", trust: "Loyal to the people who count on them", joy: "Lifts the people around them",
  love: "Fiercely protective of those they love", tension: "Notices everything; hard to fool", anger: "Says what others won't",
  fear: "Senses danger early", contempt: "Hard to intimidate", sadness: "Understands loss and what it costs", resignation: "Keeps going when others stop",
  anticipation: "Quick to act", surprise: "Adapts fast when things change", disgust: "Holds a clear line between right and wrong", neutral: "Keeps a cool head",
};
const WEAKNESS: Record<E, string> = {
  determination: "Stubborn — hard to turn once set on a course", trust: "Trusts too easily", joy: "Can celebrate too soon", love: "Love makes them vulnerable",
  tension: "Slow to trust anyone", anger: "Their temper can take over", fear: "Fear can freeze them when it matters", contempt: "Underestimates people",
  sadness: "Carries grief that weighs on every choice", resignation: "Can give up too soon", anticipation: "Impatient", surprise: "Easily thrown off balance",
  disgust: "Can be rigid and unforgiving", neutral: "Keeps too much inside",
};
const FEAR: Record<E, string> = {
  determination: "Failing when it matters most", love: "Losing the people they love", tension: "Being found out", anger: "Being made powerless",
  fear: "What is coming for them", sadness: "Losing even more than they already have", joy: "That the good moment won't last", trust: "Being betrayed",
  contempt: "Being seen as weak", resignation: "That nothing they do will change anything", anticipation: "Missing their chance", surprise: "Not seeing it coming",
  disgust: "Becoming what they despise", neutral: "Letting anyone see what they really feel",
};
const ADJ: Record<E, string> = {
  anger: "angry", fear: "afraid", sadness: "grieving", joy: "hopeful", love: "open-hearted", determination: "resolute", tension: "on edge", contempt: "scornful",
  trust: "trusting", resignation: "resigned", anticipation: "expectant", surprise: "shaken", disgust: "repelled", neutral: "guarded",
};
const WANT: [RegExp, string][] = [
  [/control|command/i, "to stay in control of what happens"], [/answer|find out|safe/i, "to know the truth"], [/hold (?:their|the) (?:ground|line)|refuse/i, "to stand their ground"],
  [/conceal|deflect|hidden/i, "to keep what they know hidden"], [/comfort|amends/i, "to be understood and forgiven"], [/closer|reassure/i, "to protect the people close to them"],
  [/confront|wound|intimidate|place/i, "to win the fight in front of them"], [/celebrate|share/i, "to hold on to the good moment"], [/warn|plead/i, "to keep everyone safe"],
  [/inform/i, "to get the facts straight"], [/trust|gratitude/i, "to earn and keep trust"], [/accept/i, "to make peace with what can't be changed"],
];
// Occupations the action or a title can state ("a corps member", "PRESIDING OFFICER", "Chief", "Dr.").
const OCCUPATIONS = "corps member|presiding officer|returning officer|polling agent|party agent|agent|police(?:man|woman| officer)?|officer|inspector|sergeant|detective|soldier|general|colonel|captain|lieutenant|commissioner|governor|senator|minister|president|chairman|politician|candidate|mayor|councillor|lawyer|barrister|judge|magistrate|doctor|nurse|surgeon|pharmacist|teacher|headmaster|headmistress|principal|lecturer|professor|student|journalist|reporter|editor|photographer|news anchor|presenter|driver|taxi driver|okada rider|mechanic|trader|market woman|market trader|shopkeeper|vendor|hawker|farmer|fisherman|pastor|priest|imam|bishop|reverend|chief|king|oba|emir|queen|prince|princess|banker|accountant|engineer|architect|programmer|developer|hacker|activist|campaigner|volunteer|clerk|secretary|assistant|aide|bodyguard|security guard|guard|thug|gangster|smuggler|thief|nanny|housekeeper|maid|cook|chef|waiter|waitress|barman|bartender|singer|musician|dancer|actor|actress|artist|writer|poet|business(?:man|woman)|entrepreneur|contractor|landlord|landlady|tailor|seamstress|carpenter|electrician|plumber|pilot|sailor|midwife|social worker|civil servant|official|electoral official";
const OCC_RE = new RegExp(`\\b(?:an?|the|as)\\s+((?:[a-z-]+\\s){0,2}?(?:${OCCUPATIONS}))\\b`, "i");
const TITLE_RE = new RegExp(`^(?:the\\s+)?(${OCCUPATIONS}|dr\\.?|prof\\.?|chief|oga|madam|alhaji|alhaja|pastor|sgt\\.?|capt\\.?|gen\\.?)\\b`, "i");
const TITLE_WORD: Record<string, string> = { "dr": "doctor", "dr.": "doctor", "prof": "professor", "prof.": "professor", "sgt": "sergeant", "sgt.": "sergeant", "capt": "captain", "capt.": "captain", "gen": "general", "gen.": "general" };

export function characterProfileEngine(raw: unknown): CharacterProfileOutput {
  const input = CharacterProfileInputSchema.parse(raw);
  const { character, introduction, lines, mentions, scenes, relationships, accent, project } = input;
  const name = character.name.replace(/\s+/g, " ").trim();
  const first = name.split(" ")[0];
  const f: CharacterProfileOutput["fields"] = {};
  const ev: Record<string, string> = {};
  const intro = introduction?.replace(/\s+/g, " ").trim() || null;
  const aboutThem = [intro ?? "", ...mentions.map((m) => m.text)].join(" ");

  // ---- Facts the script states ----
  const age = input.intro_age ?? intro?.match(/\((\d{1,3}(?:s)?)\)/)?.[1] ?? null;
  if (age) { f.age = age.slice(0, 40); ev.age = "the script's introduction"; }
  const he = (aboutThem.match(/\b(he|him|his|himself)\b/gi) ?? []).length, she = (aboutThem.match(/\b(she|her|hers|herself)\b/gi) ?? []).length;
  const introG = intro?.match(/\b(a|an|the)\s+(?:[a-z-]+\s){0,3}?(man|woman|boy|girl|mother|father|wife|husband|grandmother|grandfather|son|daughter|sister|brother|aunt|uncle)\b/i)?.[2]?.toLowerCase();
  const fem = ["woman", "girl", "mother", "wife", "grandmother", "daughter", "sister", "aunt"];
  if (introG) { f.gender = fem.includes(introG) ? "Female" : "Male"; ev.gender = `the introduction ("${introG}")`; }
  else if (he + she >= 2 && Math.max(he, she) / (he + she) >= 0.8) { f.gender = he > she ? "Male" : "Female"; ev.gender = `pronouns in the action about them (${he > she ? he : she})`; }
  const titled = name.match(TITLE_RE)?.[1]?.toLowerCase();
  const occ = character.occupation ?? (titled ? TITLE_WORD[titled] ?? titled : null) ?? aboutThem.match(OCC_RE)?.[1]?.toLowerCase() ?? null;
  if (occ && !character.occupation) { f.occupation = cap(occ).slice(0, 150); ev.occupation = titled ? "their title in the script" : "the action about them"; }
  const described = intro ?? mentions.slice(0, 3).map((m) => m.text).join(" ");
  if (described) { f.description = clip(described, 2000); ev.description = intro ? "the script's introduction" : "the action lines that name them"; }
  // Physicality & mannerisms (1.1.0): only what the script shows them doing with their body — the sentences about
  // them that use a movement or gesture word — quoted, never invented.
  const moves = [...(intro ? [intro] : []), ...mentions.map((m) => m.text)]
    .flatMap((t) => t.split(/(?<=[.!?])\s+/))
    .filter((t) => MOVE_RE.test(t))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 4);
  if (moves.length) { f.physicality = clip(`As the script shows them: ${moves.join(" ")}`, 2000); ev.physicality = `${moves.length} action line(s) about how they move`; }
  if (accent) {
    // The nationality the story's accent names ("Lagos Nigerian English" → Nigerian) — from where the story is set.
    const dem = accent.accent.match(/\b(Nigerian|Ghanaian|Kenyan|South African|Ugandan|Tanzanian|Rwandan|Ethiopian|Cameroonian|Senegalese|Ivorian|Sierra Leonean|Liberian|Zimbabwean|Zambian|Egyptian|Moroccan|British|Scottish|Welsh|Irish|American|Canadian|Jamaican|Trinidadian|Australian|New Zealand|Indian|Pakistani|Bangladeshi|Sri Lankan|Filipino|Singaporean|Malaysian|Chinese|Japanese|Korean|French|German|Spanish|Italian|Portuguese|Brazilian|Mexican|Argentinian|Colombian|Dutch|Swedish|Norwegian|Danish|Polish|Russian|Turkish|Lebanese)\b/)?.[1];
    if (dem) { f.nationality = dem; ev.nationality = `the accent the story suggests (${accent.accent})`.slice(0, 300); }
    f.accent = accent.accent.slice(0, 120);
    if (accent.languages.length) f.languages = accent.languages.join(", ").slice(0, 200);
    ev.accent = ev.languages = (accent.evidence[0] ?? "where the story is set").slice(0, 300);
  }

  // ---- How they speak: emotions, style, their strongest line ----
  const emo = new Map<E, number>();
  for (const l of lines) { const e = l.emotion ?? "neutral"; emo.set(e, (emo.get(e) ?? 0) + 1 + (l.intensity ?? 0) / 10); }
  const ranked = [...emo.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
  const top = ranked.filter((e) => e !== "neutral");
  const main = top[0] ?? ranked[0] ?? "neutral";
  const second = top[1] ?? (main !== "neutral" ? "neutral" : null);
  const words = lines.reduce((s, l) => s + (l.text.match(/[\p{L}\p{N}'’]+/gu) ?? []).length, 0);
  const avg = lines.length ? words / lines.length : 0;
  const qRate = lines.length ? lines.filter((l) => /\?\s*$/.test(l.text.trim())).length / lines.length : 0;
  const xRate = lines.length ? lines.filter((l) => /!/.test(l.text)).length / lines.length : 0;
  const style = !lines.length ? "" : avg < 6 ? "speaks in short, clipped lines" : avg > 20 ? "talks at length when they talk" : "speaks plainly";
  const styleMore = [qRate > 0.35 ? "asks more than they tell" : "", xRate > 0.3 ? "emphatic" : ""].filter(Boolean);
  const peak = lines.reduce<(typeof lines)[number] | null>((b, l) => ((l.intensity ?? 0) > (b?.intensity ?? -1) ? l : b), null);
  const [t1, t2] = TRAITS[main] ?? TRAITS.neutral;
  const t3 = second ? TRAITS[second]?.[0] : null;
  if (lines.length) {
    f.personality = clip(`${cap(t1)} and ${t2}${t3 && t3 !== t1 ? `, with a ${t3} streak` : ""}; ${style}${styleMore.length ? `, ${list(styleMore)}` : ""}.${peak ? ` In their own words: "${quote(peak.text)}"` : ""}`, 4000);
    ev.personality = `${lines.length} line(s) of dialogue${top.length ? ` (mostly ${list(top.slice(0, 2))})` : ""}`;
  } else if (described) {
    f.personality = clip(`Seen more than heard: ${described.length > 200 ? quote(described, 200) : described} They never speak in the script, so what they do says who they are.`, 4000);
    ev.personality = "the action about them (no dialogue)";
  } else {
    // Not in the script yet (added by hand): say so plainly instead of inventing a character.
    f.personality = `${occ ? `${cap(article(occ))} ${occ}` : "A character"} the script doesn't show yet — no lines or action about them so far. Their manner is open: decide it here, or write them into a scene and fill this again.`;
    ev.personality = "nothing in the script yet";
  }
  f.strengths = [STRENGTH[main], second ? STRENGTH[second] : null].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).join(". ") + ".";
  f.weaknesses = [WEAKNESS[main], second ? WEAKNESS[second] : null].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).join(". ") + ".";
  ev.strengths = ev.weaknesses = lines.length ? `the emotions in their lines (${main}${second ? `, ${second}` : ""})` : "the action about them";

  // ---- What they want and fear ----
  const intents = new Map<string, number>();
  for (const l of lines) if (l.intention) intents.set(l.intention, (intents.get(l.intention) ?? 0) + 1);
  const topIntent = [...intents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const want = topIntent ? WANT.find(([re]) => re.test(topIntent))?.[1] ?? `to ${topIntent.charAt(0).toLowerCase()}${topIntent.slice(1)}` : null;
  const inLogline = project.logline && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(project.logline);
  f.motivation = clip(inLogline ? `Drives the story: ${project.logline}${want ? ` Moment to moment, they want ${want}.` : ""}` : want ? `Wants ${want}.${occ ? ` As ${article(occ)} ${occ}, that is also the job in front of them.` : ""}` : occ ? `To do their job as ${article(occ)} ${occ} — and get through the day it lands in.` : `To get through what the story puts in front of them in ${scenes[0] ? `Scene ${scenes[0].number}` : "their scene"}.`, 2000);
  ev.motivation = inLogline ? "the logline names them" : topIntent ? `their most frequent intention ("${topIntent}")` : occ ? "their occupation" : "their scenes";
  const fearLine = lines.find((l) => l.emotion === "fear");
  f.fears = clip(fearLine ? `${FEAR.fear} — it shows when they say "${quote(fearLine.text, 70)}" (Scene ${fearLine.scene}).` : `${FEAR[main] ?? FEAR.neutral}.`, 2000);
  ev.fears = fearLine ? "a line they speak in fear" : `their dominant emotion (${main})`;

  // ---- Backstory: the facts the script gives, assembled ----
  const firstScene = scenes[0];
  const rel = relationships.slice(0, 4).map((r) => `${r.type.replace(/_/g, " ")} to ${r.other}${r.description ? ` (${quote(r.description, 80)})` : ""}`);
  f.backstory = clip([
    `${name}${f.age ? `, ${f.age},` : ""}${occ ? ` — ${article(occ)} ${occ}` : ""}${project.setting ? ` in ${project.setting}` : ""}${project.time_period ? `, ${project.time_period}` : ""}.`,
    firstScene ? `First seen in Scene ${firstScene.number} (${firstScene.heading})${intro ? `: "${quote(intro, 220)}"` : "."}` : "",
    rel.length ? `Relationships: ${list(rel)}.` : "",
    scenes.length ? `Appears in ${scenes.length}${input.total_scenes ? ` of ${input.total_scenes}` : ""} scene(s)${lines.length ? ` and speaks ${lines.length} line(s)` : ""}.` : "",
  ].filter(Boolean).join(" "), 8000);
  ev.backstory = "facts the script and Casting give (introduction, scenes, relationships)";

  // ---- Arc: how they start, where they are tested, how they end ----
  const bySceneEmotion = (n: number) => { const ls = lines.filter((l) => l.scene === n && l.emotion && l.emotion !== "neutral"); return ls.sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0]?.emotion ?? null; };
  const spoken = [...new Set(lines.map((l) => l.scene))].sort((a, b) => a - b);
  if (spoken.length >= 2) {
    const a = spoken[0], b = spoken[spoken.length - 1];
    const ea = bySceneEmotion(a) ?? "neutral", eb = bySceneEmotion(b) ?? "neutral";
    const turn = peak ? ` The turning point is Scene ${peak.scene}: "${quote(peak.text, 80)}"` : "";
    f.arc = clip(ea === eb ? `Holds steady — ${ADJ[ea]} from Scene ${a} to Scene ${b}, tested hardest along the way.${turn}` : `Begins ${ADJ[ea]} in Scene ${a} and ends ${ADJ[eb]} in Scene ${b}.${turn}`, 4000);
    ev.arc = "how their lines change from their first scene to their last";
  } else if (scenes.length) {
    f.arc = clip(`${scenes.length === 1 ? `A single-scene role in Scene ${scenes[0].number}` : `Present from Scene ${scenes[0].number} to Scene ${scenes[scenes.length - 1].number}`}${peak ? `, with one defining moment: "${quote(peak.text, 80)}"` : " — their presence matters more than any change"}.`, 4000);
    ev.arc = "the scenes they appear in";
  } else {
    f.arc = "Not in any scene of the approved script yet — their arc begins once they appear.";
    ev.arc = "no scenes yet";
  }
  return { fields: f, evidence: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.slice(0, 300)])), engine_version: ENGINE_VERSION };
}
