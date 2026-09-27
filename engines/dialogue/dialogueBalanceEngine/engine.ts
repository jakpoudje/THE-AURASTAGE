// engines/dialogue/dialogueBalanceEngine
// Per-scene dialogue balance: who speaks how much, long speeches, and scenes one
// voice dominates. Every figure is counted from the lines themselves.
import { DOMINANT_MIN_LINES, DOMINANT_SHARE, LONG_SPEECH_WORDS } from "./rules";
import { validateBalanceInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { BalanceOutput, SceneBalance } from "./output.schema";

export function dialogueBalanceEngine(rawInput: unknown): BalanceOutput {
  const { lines } = validateBalanceInput(rawInput);
  const byScene = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!byScene.has(l.scene_number)) byScene.set(l.scene_number, []);
    byScene.get(l.scene_number)!.push(l);
  }
  const scenes: SceneBalance[] = [...byScene.entries()]
    .sort(([a], [b]) => a - b)
    .map(([scene_number, ls]) => {
      const words = ls.reduce((s, l) => s + l.word_count, 0);
      const per = new Map<string, { speaker_name: string; lines: number; words: number }>();
      for (const l of ls) {
        const e = per.get(l.speaker_key) ?? { speaker_name: l.speaker_name, lines: 0, words: 0 };
        e.lines++;
        e.words += l.word_count;
        per.set(l.speaker_key, e);
      }
      const speakers = [...per.entries()]
        .map(([speaker_key, e]) => ({ speaker_key, ...e, share: words ? Math.round((e.words / words) * 100) / 100 : 0 }))
        .sort((a, b) => b.words - a.words || a.speaker_key.localeCompare(b.speaker_key));
      const flags: SceneBalance["flags"] = [];
      if (speakers.length >= 2 && ls.length >= DOMINANT_MIN_LINES && speakers[0].share > DOMINANT_SHARE) {
        flags.push({
          kind: "dominant_speaker",
          message: `${speakers[0].speaker_name} has ${Math.round(speakers[0].share * 100)}% of the words in this scene.`,
        });
      }
      if (speakers.length === 1 && ls.length >= 2) {
        flags.push({ kind: "single_speaker", message: `Only ${speakers[0].speaker_name} speaks in this scene.` });
      }
      for (const l of ls) {
        if (l.word_count > LONG_SPEECH_WORDS) {
          flags.push({ kind: "long_speech", ordinal: l.ordinal, message: `${l.speaker_name}'s line ${l.ordinal} is ${l.word_count} words long.` });
        }
      }
      return {
        scene_number,
        lines: ls.length,
        words,
        dialogue_seconds: Math.round(ls.reduce((s, l) => s + l.estimated_seconds, 0) * 10) / 10,
        speakers,
        flags,
      };
    });
  return { scenes, engine_version: ENGINE_VERSION };
}
