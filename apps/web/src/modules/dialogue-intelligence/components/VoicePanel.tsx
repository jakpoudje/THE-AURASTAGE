// Character Voice & Style (UI_REFERENCE §5): each speaker's measured voice,
// computed across all their approved-script lines.
import type { Voiceprint } from "@aurastage/engines";

export function VoicePanel({ voiceprints, displayName }: { voiceprints: Voiceprint[]; displayName: (speakerKey: string, fallback: string) => string }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="text-xs uppercase tracking-widest text-aura-gold">Character voice & style</h3>
      {voiceprints.length === 0 ? (
        <p className="mt-2 text-sm text-white/40">No speakers in this scene.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {voiceprints.map((v) => (
            <li key={v.speaker_key} className="text-sm">
              <div className="flex items-baseline justify-between">
                <span>{displayName(v.speaker_key, v.speaker_name)}</span>
                <span className="text-[11px] text-white/40">
                  {v.lines} lines · {v.words} words (whole script)
                </span>
              </div>
              <dl className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-white/60">
                <div>
                  <dt className="text-white/35">Words/line</dt>
                  <dd>{v.avg_words_per_line}</dd>
                </div>
                <div>
                  <dt className="text-white/35">Questions</dt>
                  <dd>{Math.round(v.question_rate * 100)}%</dd>
                </div>
                <div>
                  <dt className="text-white/35">Exclaims</dt>
                  <dd>{Math.round(v.exclamation_rate * 100)}%</dd>
                </div>
              </dl>
              {v.distinctive_words.length > 0 && <p className="mt-1 text-[11px] text-white/50">Signature words: {v.distinctive_words.join(", ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
