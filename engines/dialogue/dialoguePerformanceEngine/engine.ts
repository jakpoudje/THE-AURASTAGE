// engines/dialogue/dialoguePerformanceEngine
// Built-in story intelligence (owner, 2026-09-30: "the engines we built should make these decisions… only generation
// through a third party should cost money"). Reads every line of a scene the way an actor's first pass would — the
// words, the parenthetical, the punctuation, the line before it and the scene's mood — and proposes the performance:
// emotion, intensity (0–10), intention (what the speaker is trying to do), subtext (what is under the words) and
// delivery. Deterministic and free; every read carries the evidence it came from, and a person can change any of it.
import { DialoguePerformanceInputSchema, type DialoguePerformanceOutput, type LineRead } from "./schema";
import { ENGINE_VERSION } from "./version";

type Emotion = LineRead["emotion"];
type Form = "question" | "command" | "refusal" | "deflection" | "apology" | "thanks" | "threat" | "plea" | "promise" | "insult" | "exclaim" | "statement";

/** Emotion lexicon: the first rule with the most hits wins; weights break ties. */
const LEXICON: [Emotion, number, RegExp][] = [
  ["anger", 8, /\b(get out|how dare|liar|lied|shut up|enough|damn|hate|bastard|idiot|stupid|fool|furious|angry|rubbish|nonsense|thief|thieves|cheat(?:ed|ing)?|rigged?|stole|stolen)\b/gi],
  ["fear", 7, /\b(afraid|scared|terrified|help me|please don'?t|don'?t hurt|run|hide|they'?re coming|they will kill|kill (?:me|us)|danger|dangerous)\b/gi],
  ["sadness", 5, /\b(sorry|miss (?:you|him|her|them)|gone|lost|dead|died|cry|crying|tears|forgive|alone|grave|funeral|mourn)\b/gi],
  ["love", 5, /\b(love|darling|beautiful|my dear|sweetheart|honey|my heart|my wife|my husband|my son|my daughter|my child)\b/gi],
  ["determination", 6, /\b(have to|must|will not|won'?t|never|promise|always|swear|no matter what|we fight|stand|count(?:ed|ing)? every|until)\b/gi],
  ["tension", 6, /\b(whispers?|quietly|careful|watch(?: out)?|listen|wait|not here|keep your voice|someone|be quick|hurry)\b/gi],
  ["joy", 5, /\b(ha+|hahaha|laughs?|great|wonderful|finally|yes+|thank god|we did it|congratulations|beautiful day|won|winner)\b/gi],
  ["contempt", 6, /\b(pathetic|beneath|small man|who do you think|you people|clown|joke|worthless)\b/gi],
  ["trust", 4, /\b(trust|believe you|i'?m with you|count on|together|thank you|thanks)\b/gi],
  ["resignation", 4, /\b(whatever|what can we do|it is what it is|no use|doesn'?t matter|so be it|fine then|i give up)\b/gi],
  ["surprise", 5, /\b(what\?|really\?|no way|impossible|you'?re joking|since when|oh my god|chai|ah ah|haba)\b/gi],
  ["disgust", 5, /\b(disgusting|sick|filth|rotten|shame on|shameful)\b/gi],
];
/** Parenthetical cues (the writer's own direction wins over the words). */
const PAREN: [RegExp, Emotion | null, number][] = [
  [/\b(angr(?:y|ily)|furious|shouting|shouts|yelling|snaps?)\b/i, "anger", 2],
  [/\b(whisper(?:s|ing)?|quietly|softly|under (?:his|her|their) breath|low)\b/i, "tension", -1],
  [/\b(laugh(?:s|ing)?|grinning|smiling|amused|delighted)\b/i, "joy", 0],
  [/\b(crying|tearful|in tears|sobbing|choked)\b/i, "sadness", 1],
  [/\b(afraid|terrified|trembling|shaking|panicked)\b/i, "fear", 1],
  [/\b(sarcastic(?:ally)?|dry|drily|wry(?:ly)?|mocking)\b/i, "contempt", 0],
  [/\b(firm(?:ly)?|resolute|steady|flatly)\b/i, "determination", 0],
  [/\b(stunned|shocked|surprised)\b/i, "surprise", 1],
  [/\b(tired|weary|exhausted|sighs?)\b/i, "resignation", -1],
  [/\b(beat|pause|hesitat(?:es|ing))\b/i, null, 0],
];
const IMPERATIVE = /^(?:(?:now|please|just|hey|you),?\s+)?(go|get|stop|give|tell|listen|look|come|sit|stand|take|bring|leave|move|open|close|put|hold|wait|count|sign|read|write|show|call|keep|let|help|don'?t|do not|never)\b/i;
const DEFLECT = /\b(i'?m fine|it'?s nothing|nothing happened|don'?t worry|forget it|never mind|it doesn'?t matter|not now|leave it|i don'?t know|who knows|none of your business)\b/i;
const THREAT = /\b(or else|you will (?:regret|pay)|i will (?:end|finish|destroy)|watch yourself|last warning|you'?ll see)\b/i;
const PLEA = /\b(please|i beg|i'?m begging|help (?:me|us)|have mercy)\b/i;
const PROMISE = /\b(i promise|i swear|i will|we will|i'?ll|we'?ll)\b/i;
const APOLOGY = /\b(sorry|forgive me|my fault|i apologi[sz]e)\b/i;
const THANKS = /\b(thank you|thanks|god bless you)\b/i;
const INSULT = /\b(idiot|fool|stupid|clown|liar|thief|coward|useless)\b/i;
const REFUSE = /^(?:no|never|not a chance|absolutely not|i won'?t|i will not|i refuse|no way)\b/i;

const BASE: Record<Emotion, number> = { neutral: 3, joy: 5, sadness: 5, anger: 7, fear: 7, surprise: 5, disgust: 5, trust: 4, anticipation: 4, tension: 6, love: 5, contempt: 6, resignation: 3, determination: 6 };
const MOOD_EMOTION: [RegExp, Emotion][] = [
  [/tense|threat|menac|uneasy|nervous|paranoi|claustro|dark|oppress/i, "tension"], [/sad|melanchol|grief|mourn|somber|sombre/i, "sadness"],
  [/angry|volatile|hostile|furious/i, "anger"], [/warm|joy|celebrat|hopeful|light|playful/i, "joy"], [/romantic|intimate|tender/i, "love"],
  [/fear|eerie|scary|dread/i, "fear"], [/resolute|defiant|determined/i, "determination"],
];

const INTENTION: Record<Form, (e: Emotion) => string> = {
  question: (e) => (e === "anger" || e === "contempt" ? "Challenge them" : e === "fear" || e === "tension" ? "Find out if they're safe" : "Get an answer"),
  command: (e) => (e === "fear" || e === "tension" ? "Get them to act, now" : "Take control"),
  refusal: () => "Refuse and hold the line",
  deflection: () => "Deflect and conceal",
  apology: () => "Make amends",
  thanks: () => "Show gratitude",
  threat: () => "Intimidate",
  plea: () => "Plead",
  promise: () => "Reassure and commit",
  insult: () => "Wound them",
  exclaim: (e) => (e === "joy" ? "Celebrate" : e === "anger" ? "Confront them" : "Make them react"),
  statement: (e) => ({
    anger: "Confront them", fear: "Warn them", sadness: "Reach for comfort", love: "Draw them closer", determination: "Hold their ground", tension: "Keep it hidden",
    joy: "Share the moment", contempt: "Put them in their place", trust: "Win their trust", resignation: "Accept it", surprise: "Make sense of it",
    disgust: "Reject it", anticipation: "Push things forward", neutral: "Inform",
  } as Record<Emotion, string>)[e],
};

function subtextFor(form: Form, e: Emotion, speaker: string, listener: string | null, answerTo: string | null, short: boolean): string {
  const them = listener ?? "the others";
  if (answerTo && short && form !== "question") return `${speaker} answers "${answerTo}" as briefly as possible — there is more they aren't saying.`;
  switch (form) {
    case "deflection": return `${speaker} is covering ${e === "neutral" ? "what they feel" : e === "fear" ? "their fear" : e === "sadness" ? "their hurt" : "it"}; the words close the subject so ${them} won't look closer.`;
    case "question": return e === "anger" || e === "contempt" ? `Not a real question — ${speaker} is accusing ${them}.` : e === "fear" || e === "tension" ? `${speaker} needs reassurance more than information.` : `${speaker} is testing how ${them} will respond, not only asking.`;
    case "command": return `${speaker} needs this to go their way and won't leave room for argument.`;
    case "refusal": return `A line ${speaker} won't cross — whatever it costs them.`;
    case "apology": return `${speaker} is asking to be forgiven, and to keep ${them} close.`;
    case "thanks": return `${speaker} means it; the relief shows underneath.`;
    case "threat": return `${speaker} wants ${them} afraid enough to back down.`;
    case "plea": return `${speaker} has run out of other options.`;
    case "promise": return `${speaker} is steadying ${them} — and themselves.`;
    case "insult": return `${speaker} strikes where it hurts, to regain the upper hand.`;
    case "exclaim": return e === "joy" ? `Pure release after what came before.` : `${speaker} can't hold it in any longer.`;
    default: return ({
      anger: `Under the words, ${speaker} feels wronged and wants ${them} to know it.`,
      fear: `${speaker} is more frightened than they let on.`,
      sadness: `${speaker} is carrying a loss they don't name.`,
      love: `${speaker} is saying how much ${them} matter without saying it outright.`,
      determination: `${speaker} has already decided; this is them committing out loud.`,
      tension: `${speaker} is choosing every word carefully — someone could be listening.`,
      joy: `${speaker} lets the good moment in, for now.`,
      contempt: `${speaker} doesn't think ${them} deserve a real answer.`,
      trust: `${speaker} is offering trust and hoping it is returned.`,
      resignation: `${speaker} has stopped fighting this, at least for now.`,
      surprise: `${speaker} is recalculating what they thought they knew.`,
      disgust: `${speaker} wants distance from what they've just heard.`,
      anticipation: `${speaker} is leaning towards what comes next.`,
      neutral: `Plain on the surface; ${speaker} keeps what they feel to themselves.`,
    } as Record<Emotion, string>)[e];
  }
}

function formOf(text: string): Form {
  const t = text.trim();
  if (DEFLECT.test(t)) return "deflection";
  if (THREAT.test(t)) return "threat";
  if (INSULT.test(t)) return "insult";
  if (PLEA.test(t) && !/\?\s*$/.test(t)) return "plea";
  if (APOLOGY.test(t)) return "apology";
  if (THANKS.test(t)) return "thanks";
  if (REFUSE.test(t)) return "refusal";
  if (/\?\s*$/.test(t) || /\?["”']?\s*$/.test(t)) return "question";
  if (PROMISE.test(t)) return "promise";
  if (IMPERATIVE.test(t)) return "command";
  if (/!/.test(t)) return "exclaim";
  return "statement";
}

const words = (s: string) => (s.match(/[\p{L}\p{N}'’]+/gu) ?? []).length;
const quote = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function dialoguePerformanceEngine(raw: unknown): DialoguePerformanceOutput {
  const { scene, lines } = DialoguePerformanceInputSchema.parse(raw);
  const moodEmotion = MOOD_EMOTION.find(([re]) => scene.mood.some((m) => re.test(m)))?.[1] ?? null;
  const out: LineRead[] = [];
  lines.forEach((l, i) => {
    const text = l.text.trim();
    const paren = (l.parenthetical ?? "").replace(/[()]/g, "").trim();
    const prev = lines[i - 1];
    const next = lines[i + 1];
    const listener = [prev, next].find((x) => x && x.speaker !== l.speaker)?.speaker ?? null;
    const evidence: string[] = [];

    // 1. Emotion: the writer's parenthetical first, then the words, then the scene's mood.
    let emotion: Emotion = "neutral";
    let bump = 0;
    const p = PAREN.find(([re]) => re.test(paren));
    if (p) {
      bump += p[2];
      if (p[1]) emotion = p[1];
      evidence.push(`(${quote(paren, 30)})`);
    }
    if (emotion === "neutral") {
      let best: [Emotion, number, string] | null = null;
      for (const [e, w, re] of LEXICON) {
        const hits = text.match(re);
        if (hits && (!best || hits.length * w > best[1])) best = [e, hits.length * w, hits[0]];
      }
      if (best) {
        emotion = best[0];
        evidence.push(`"${best[2]}"`);
      }
    }
    const form = formOf(text);
    if (emotion === "neutral") {
      const byForm: Partial<Record<Form, Emotion>> = { threat: "anger", insult: "contempt", plea: "fear", apology: "sadness", thanks: "trust", refusal: "determination", promise: "determination", deflection: "tension", question: "anticipation" };
      if (form === "question" && moodEmotion) { emotion = moodEmotion; evidence.push(`a question in a ${scene.mood[0]} scene`); }
      else if (byForm[form]) { emotion = byForm[form]!; evidence.push(form === "question" ? "a question" : `a ${form}`); }
      else if (/!/.test(text)) { emotion = "surprise"; evidence.push("an exclamation"); }
      else if (moodEmotion) { emotion = moodEmotion; evidence.push(`the scene's mood (${scene.mood.join(", ")})`); }
    }

    // 2. Intensity: the emotion's weight, shaped by punctuation, capitals, the parenthetical and where it falls.
    let intensity = BASE[emotion] + bump;
    const bangs = (text.match(/!/g) ?? []).length;
    if (bangs) intensity += Math.min(2, bangs);
    const shout = (text.match(/\b[A-Z]{3,}\b/g) ?? []).filter((w) => !/^(OK|TV|USA|UK|INEC|NYSC|APC|PDP|LGA)$/.test(w)).length;
    if (shout) { intensity += 1; evidence.push("words in capitals"); }
    if (/\.\.\.|…|—\s*$|--\s*$/.test(text)) { intensity -= 1; evidence.push("trails off"); }
    if (i === lines.length - 1 && lines.length > 3 && emotion !== "neutral") intensity += 1;
    intensity = Math.max(1, Math.min(10, intensity));

    // 3. Intention and subtext: what the line is for, and what sits under it.
    const answerTo = prev && prev.speaker !== l.speaker && /\?\s*$/.test(prev.text.trim()) ? quote(prev.text.trim(), 50) : null;
    const short = words(text) <= 4;
    const intention = INTENTION[form](emotion);
    const subtext = subtextFor(form, emotion, titleCase(l.speaker), listener ? titleCase(listener) : null, answerTo, short);

    // 4. Delivery: pace and volume from length, punctuation and intensity.
    const pace = /\.\.\.|…|—/.test(text) || /pause|beat|hesitat/i.test(paren) ? "with pauses" : words(text) > 30 ? "measured, building" : short ? "clipped" : intensity >= 7 ? "quick" : "even";
    const volume = /whisper|quietly|softly|under (?:his|her|their) breath/i.test(paren) ? "barely above a whisper" : shout || /shout|yell/i.test(paren) || intensity >= 8 ? "raised" : intensity <= 3 ? "low" : "natural";
    const delivery = `${cap(pace)}, ${volume}${form === "question" ? ", the question lands at the end" : ""}.`;

    out.push({ id: l.id, emotion, intensity, intention, subtext: subtext.slice(0, 2000), delivery, evidence: (evidence.join(", ") || `a ${form}`).slice(0, 300) });
  });
  return { lines: out, engine_version: ENGINE_VERSION };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
