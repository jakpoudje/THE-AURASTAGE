// engines/dialogue/dialogueVoiceprintEngine
// SRS §7 "detect character voice drift and repeated phrasing": a measurable
// profile of how each character speaks, computed only from their lines.
import { NGRAM, REPEAT_MIN_OCCURRENCES, STOPWORDS, TOP_WORDS } from "./rules";
import { validateVoiceprintInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { Voiceprint, VoiceprintOutput } from "./output.schema";

const tokens = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? []).map((t) => t.replace(/’/g, "'"));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function dialogueVoiceprintEngine(rawInput: unknown): VoiceprintOutput {
  const { lines } = validateVoiceprintInput(rawInput);
  const bySpeaker = new Map<string, typeof lines>();
  for (const l of lines) {
    if (!bySpeaker.has(l.speaker_key)) bySpeaker.set(l.speaker_key, []);
    bySpeaker.get(l.speaker_key)!.push(l);
  }

  // Corpus-wide word frequencies for "distinctive" scoring.
  const globalFreq = new Map<string, number>();
  let globalTotal = 0;
  for (const l of lines) for (const t of tokens(l.text)) {
    globalFreq.set(t, (globalFreq.get(t) ?? 0) + 1);
    globalTotal++;
  }

  const voiceprints: Voiceprint[] = [...bySpeaker.entries()].map(([key, ls]) => {
    const all = ls.flatMap((l) => tokens(l.text));
    const freq = new Map<string, number>();
    for (const t of all) freq.set(t, (freq.get(t) ?? 0) + 1);
    const words = all.length;

    const distinctive = [...freq.entries()]
      .filter(([w, c]) => !STOPWORDS.has(w) && w.length > 2 && c >= 2)
      .map(([w, c]) => {
        const mine = c / Math.max(1, words);
        const others = ((globalFreq.get(w) ?? 0) - c) / Math.max(1, globalTotal - words);
        return { w, score: (mine + 0.001) / (others + 0.001), c };
      })
      .sort((a, b) => b.score - a.score || b.c - a.c || a.w.localeCompare(b.w))
      .slice(0, TOP_WORDS)
      .map((x) => x.w);

    const grams = new Map<string, { count: number; scenes: Set<number> }>();
    for (const l of ls) {
      const t = tokens(l.text);
      const seen = new Set<string>();
      for (let i = 0; i + NGRAM <= t.length; i++) {
        const g = t.slice(i, i + NGRAM).join(" ");
        if (t.slice(i, i + NGRAM).every((w) => STOPWORDS.has(w)) || seen.has(g)) continue;
        seen.add(g);
        const e = grams.get(g) ?? { count: 0, scenes: new Set<number>() };
        e.count++;
        e.scenes.add(l.scene_number);
        grams.set(g, e);
      }
    }
    const repeated_phrases = [...grams.entries()]
      .filter(([, e]) => e.count >= REPEAT_MIN_OCCURRENCES)
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([phrase, e]) => ({ phrase, count: e.count, scenes: [...e.scenes].sort((x, y) => x - y) }));

    const lineCounts = new Map<string, number>();
    for (const l of ls) {
      const n = l.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (tokens(n).length >= 3) lineCounts.set(n, (lineCounts.get(n) ?? 0) + 1);
    }

    return {
      speaker_key: key,
      speaker_name: ls[0].speaker_name,
      lines: ls.length,
      words,
      avg_words_per_line: round(words / ls.length, 1),
      question_rate: round(ls.filter((l) => /\?\s*$/.test(l.text.trim())).length / ls.length),
      exclamation_rate: round(ls.filter((l) => /!\s*$/.test(l.text.trim())).length / ls.length),
      vocabulary_variety: words ? round(freq.size / words) : 0,
      distinctive_words: distinctive,
      repeated_phrases,
      repeated_lines: [...lineCounts.entries()].filter(([, c]) => c > 1).map(([text, count]) => ({ text, count })),
    };
  });

  voiceprints.sort((a, b) => b.lines - a.lines || a.speaker_key.localeCompare(b.speaker_key));
  return { voiceprints, engine_version: ENGINE_VERSION };
}
