// engines/character/characterCandidateExtractionEngine
// SRS §6.1: builds character candidates from structured screenplay evidence.
// Hard evidence: character cues (who speaks). Strong: CAPS introductions in
// action ("TUNDE OKAFOR (35)"), then name mentions in action. Each candidate
// carries per-scene evidence with source line numbers, and a confidence
// P = σ(w0 + Σ wᵢxᵢ). Anything below the automatic threshold is flagged for a
// person to confirm — never silently inserted. Deterministic; no AI calls.

import { normalizeCharacterName, type CharacterRole, type PresenceEvidence, type ScreenplayElement } from "@aurastage/contracts";
import {
  AUTO_ACCEPT_THRESHOLD,
  CAPS_NAME_RE,
  GROUP_RE,
  INTRO_RE,
  NOT_A_NAME,
  VOICE_ONLY_EXTENSIONS,
  WEIGHTS,
  sigmoid,
} from "./rules";
import { validateCharacterExtractionInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { CharacterCandidate, CharacterExtractionOutput, SceneAppearance } from "./output.schema";

type SceneAcc = { cue: boolean; voiceOnlyCuesOnly: boolean; lines: number; seen: boolean; evidence: PresenceEvidence[]; best: number };
type Acc = {
  key: string;
  display: string;
  aliases: Set<string>;
  age: string | null;
  introduction: string | null;
  introducedWithAge: boolean;
  introducedNoAge: boolean;
  scenes: Map<number, SceneAcc>;
};

const MAX_EVIDENCE_PER_SCENE = 8;

function isNameLike(key: string): boolean {
  const words = key.split(" ");
  return words.length > 0 && !words.every((w) => NOT_A_NAME.has(w)) && /[A-Z\p{L}]/u.test(key);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function characterCandidateExtractionEngine(rawInput: unknown): CharacterExtractionOutput {
  const { elements, scenes } = validateCharacterExtractionInput(rawInput);

  const sceneOf = new Map<number, number>();
  for (const s of scenes) for (let i = s.element_start; i <= s.element_end; i++) sceneOf.set(i, s.number);

  const accs = new Map<string, Acc>();
  const get = (key: string, display: string): Acc => {
    let a = accs.get(key);
    if (!a) {
      a = { key, display, aliases: new Set(), age: null, introduction: null, introducedWithAge: false, introducedNoAge: false, scenes: new Map() };
      accs.set(key, a);
    }
    return a;
  };
  const sceneAcc = (a: Acc, n: number): SceneAcc => {
    let s = a.scenes.get(n);
    if (!s) {
      s = { cue: false, voiceOnlyCuesOnly: true, lines: 0, seen: false, evidence: [], best: 0 };
      a.scenes.set(n, s);
    }
    return s;
  };
  const addEvidence = (s: SceneAcc, ev: PresenceEvidence, conf: number) => {
    if (s.evidence.length < MAX_EVIDENCE_PER_SCENE) s.evidence.push(ev);
    s.best = Math.max(s.best, conf);
  };

  // 1. Cues: hard evidence of a speaking character.
  let current: { acc: Acc; scene: SceneAcc } | null = null;
  for (const el of elements) {
    const n = sceneOf.get(el.index);
    if (el.type === "character" && el.speaker) {
      const key = normalizeCharacterName(el.speaker);
      if (!key || n === undefined) {
        current = null;
        continue;
      }
      const acc = get(key, el.speaker);
      const s = sceneAcc(acc, n);
      const voiceOnly = (el.extensions ?? []).some((e) => VOICE_ONLY_EXTENSIONS.has(e.toUpperCase()));
      s.cue = true;
      if (!voiceOnly) s.voiceOnlyCuesOnly = false;
      addEvidence(s, { type: "cue", line: el.line, text: el.text }, 0.99);
      current = { acc, scene: s };
    } else if (el.type === "dialogue" && current) {
      current.scene.lines += 1;
    } else if (el.type !== "parenthetical") {
      current = null;
    }
  }

  // 2. Introductions in action lines: "TUNDE OKAFOR (35)" (strong), "AMARA BELLO waits" (weaker).
  const actions = elements.filter((e) => e.type === "action" && sceneOf.has(e.index));
  for (const el of actions) {
    const n = sceneOf.get(el.index)!;
    const withAge = new Set<string>();
    for (const m of el.text.matchAll(INTRO_RE)) {
      const key = normalizeCharacterName(m[1]);
      if (!isNameLike(key)) continue;
      withAge.add(key);
      const acc = get(key, m[1].trim());
      if (!acc.introduction) {
        acc.introduction = el.text.slice(0, 280);
        acc.age = m[2];
      }
      acc.introducedWithAge = true;
      const s = sceneAcc(acc, n);
      s.seen = true;
      addEvidence(s, { type: "introduction", line: el.line, text: `${m[1].trim()} (${m[2]})` }, 0.9);
    }
    for (const m of el.text.matchAll(CAPS_NAME_RE)) {
      const key = normalizeCharacterName(m[1]);
      if (withAge.has(key) || !isNameLike(key) || key.split(" ").some((w) => NOT_A_NAME.has(w))) continue;
      const acc = get(key, m[1].trim());
      if (!acc.introduction) acc.introduction = el.text.slice(0, 280);
      acc.introducedNoAge = true;
      const s = sceneAcc(acc, n);
      s.seen = true;
      addEvidence(s, { type: "introduction", line: el.line, text: m[1].trim() }, 0.7);
    }
  }

  // 3. Alias linking: cue "TUNDE" + introduction "TUNDE OKAFOR" are one person, when unambiguous.
  const multi = [...accs.values()].filter((a) => a.key.includes(" "));
  const ambiguity = new Map<string, string[]>();
  for (const short of [...accs.values()].filter((a) => !a.key.includes(" "))) {
    const matches = multi.filter((m) => {
      const words = m.key.split(" ");
      return words[0] === short.key || words[words.length - 1] === short.key;
    });
    if (matches.length === 1) {
      const full = matches[0];
      full.aliases.add(short.display);
      for (const [n, s] of short.scenes) {
        const t = sceneAcc(full, n);
        t.cue ||= s.cue;
        t.voiceOnlyCuesOnly &&= s.voiceOnlyCuesOnly;
        t.lines += s.lines;
        t.seen ||= s.seen;
        for (const ev of s.evidence) addEvidence(t, ev, s.best);
        t.best = Math.max(t.best, s.best);
      }
      full.introducedWithAge ||= short.introducedWithAge;
      accs.delete(short.key);
    } else if (matches.length > 1) {
      ambiguity.set(short.key, matches.map((m) => m.display));
    }
  }

  // 4. Mentions in action (Title Case or CAPS) add on-screen presence evidence.
  for (const acc of accs.values()) {
    const names = [acc.display, ...acc.aliases].map((x) => x.trim()).filter((x) => x.length >= 3);
    if (!names.length) continue;
    const re = new RegExp(`(^|[^\\p{L}])(${names.map(escapeRe).join("|")})(?![\\p{L}])`, "iu");
    for (const el of actions) {
      if (!re.test(el.text)) continue;
      const n = sceneOf.get(el.index)!;
      const s = sceneAcc(acc, n);
      if (!s.seen) {
        s.seen = true;
        addEvidence(s, { type: "mention", line: el.line, text: el.text.slice(0, 120) }, 0.75);
      }
    }
  }

  // 5. Score, classify and suggest roles.
  const totalScenes = Math.max(1, scenes.length);
  const built = [...accs.values()].map((a) => {
    const appearances: SceneAppearance[] = [...a.scenes.entries()]
      .sort(([x], [y]) => x - y)
      .map(([n, s]) => ({
        scene_number: n,
        speaking: s.cue,
        voice_only: s.cue && s.voiceOnlyCuesOnly && !s.seen,
        line_count: s.lines,
        confidence: Math.round(s.best * 100) / 100,
        evidence: s.evidence,
      }));
    const cueScenes = appearances.filter((x) => x.speaking).length;
    const mentionScenes = appearances.filter((x) => !x.speaking).length;
    const hasCue = cueScenes > 0;
    const z =
      WEIGHTS.bias +
      WEIGHTS.cue * Math.min(cueScenes, WEIGHTS.maxCueScenes) +
      (a.introducedWithAge ? WEIGHTS.introductionWithAge : a.introducedNoAge ? WEIGHTS.introductionNoAge : 0) +
      WEIGHTS.mention * Math.min(Math.max(mentionScenes - 1, 0), WEIGHTS.maxMentionScenes);
    const confidence = hasCue ? Math.max(0.99, sigmoid(z)) : sigmoid(z);
    const total_lines = appearances.reduce((s, x) => s + x.line_count, 0);
    const kind = GROUP_RE.test(a.key) ? ("group" as const) : ("individual" as const);
    const amb = ambiguity.get(a.key);
    const needs_confirmation = confidence < AUTO_ACCEPT_THRESHOLD;
    const reason = hasCue
      ? `Speaks in ${cueScenes} ${cueScenes === 1 ? "scene" : "scenes"}${amb ? `; could also be ${amb.join(" or ")} — merge them if so` : ""}.`
      : a.introducedWithAge
        ? "Introduced in the action with an age, but never speaks."
        : "Named in capitals in the action only — please confirm this is a character.";
    return {
      key: a.key,
      display_name: titleCase(a.display),
      aliases: [...a.aliases].map(titleCase).filter((x) => normalizeCharacterName(x) !== a.key),
      kind,
      age: a.age,
      introduction: a.introduction,
      total_lines,
      appearances,
      confidence: Math.round(confidence * 1000) / 1000,
      needs_confirmation,
      reason,
      _weight: total_lines + 2 * appearances.length,
      _introduced: a.introducedWithAge,
      _share: appearances.length / totalScenes,
    };
  });

  // Leads: at most two speaking individuals who carry the story — present in ≥30% of scenes and
  // within 60% of the most prominent character. Ties prefer characters the script formally
  // introduces (CAPS name with age), then name order, so the result is stable.
  const individualsBySize = built
    .filter((c) => c.kind === "individual" && c.total_lines > 0)
    .sort((a, b) => b._weight - a._weight || Number(b._introduced) - Number(a._introduced) || a.key.localeCompare(b.key));
  const topWeight = individualsBySize[0]?._weight ?? 0;
  const leads = new Set(
    individualsBySize
      .slice(0, 2)
      .filter((c) => c._share >= 0.3 && c._weight >= 0.6 * topWeight)
      .map((c) => c.key)
  );
  const roleFor = (c: (typeof built)[number]): CharacterRole => {
    if (c.kind === "group" || c.total_lines === 0) return "extra";
    if (leads.has(c.key)) return "lead";
    if (c.appearances.length >= 2 || c.total_lines >= 5) return "supporting";
    return "minor";
  };

  const candidates: CharacterCandidate[] = built
    .map(({ _weight, _share, _introduced, ...c }) => ({ ...c, suggested_role: roleFor({ ...c, _weight, _share, _introduced }) }))
    .sort((a, b) => b.total_lines - a.total_lines || b.appearances.length - a.appearances.length || a.key.localeCompare(b.key));

  return { candidates, engine_version: ENGINE_VERSION };
}
