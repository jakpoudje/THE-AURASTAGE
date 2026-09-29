"use client";

// Voice DNA (owner, 2026-09-28: "different voice types that reflect character DNAs"). The character's voice is worked
// out from the saved Casting profile by voiceCastingEngine — the same engine the server uses when Audio Studio speaks a
// line — so what is shown here is exactly what the built-in voice will use. Each line's emotion then shapes delivery.
import Link from "next/link";
import { useMemo } from "react";
import type { Character } from "@aurastage/contracts";
import { voiceCastingEngine } from "@aurastage/engines";

const EMOTIONS = ["anger", "fear", "sadness", "joy", "tension", "love"] as const;

export function VoiceDnaTab({ character, projectId, dirty }: { character: Character; projectId: string; dirty: boolean }) {
  const who = useMemo(() => ({
    name: character.name, age: character.age ?? null, gender: character.gender ?? null, nationality: character.nationality ?? null,
    personality: character.personality ?? null, description: character.description ?? null,
  }), [character]);
  const base = useMemo(() => voiceCastingEngine({ character: who }), [who]);
  const moods = useMemo(() => EMOTIONS.map((e) => ({ e, v: voiceCastingEngine({ character: who, line: { emotion: e, intensity: 7 } }) })), [who]);

  return (
    <div className="space-y-4" aria-label="Voice DNA">
      {dirty && <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">Save the profile to update the voice — it's worked out from the saved profile.</p>}
      <section className="rounded-lg border border-aura-border p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/50">{character.name}'s voice</div>
        <p className="mt-1 text-base text-white" data-testid="voice-description">{base.description}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div><dt className="text-white/40">Voice type</dt><dd><span className="capitalize">{base.age_band}</span> · {base.gender === "unspecified" ? "gender not set" : base.gender}</dd></div>
          <div><dt className="text-white/40">Register</dt><dd>{base.pitch} / 99</dd></div>
          <div><dt className="text-white/40">Pace</dt><dd>{base.speed} words/min</dd></div>
          <div><dt className="text-white/40">Built-in voice</dt><dd className="font-mono">{base.voice_id}</dd></div>
        </dl>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-white/50">Why this voice</div>
        <ul aria-label="Why this voice" className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-white/70">
          {base.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
        <p className="mt-2 text-xs text-white/40">Change Age, Gender, Nationality or Personality in the profile to change the voice.</p>
      </section>

      <section className="rounded-lg border border-aura-border p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/50">How emotion changes delivery</div>
        <p className="mt-1 text-xs text-white/50">Each line's emotion (set in Dialogue Intelligence) shapes how it's spoken. Examples at intensity 7/10:</p>
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-white/40"><th className="py-1 font-normal">Emotion</th><th className="font-normal">Register</th><th className="font-normal">Pace</th><th className="font-normal">Loudness</th></tr></thead>
          <tbody>
            {moods.map(({ e, v }) => (
              <tr key={e} className="border-t border-aura-border/60">
                <td className="py-1.5 capitalize">{e}</td>
                <td>{v.pitch}{v.pitch !== base.pitch && <span className="text-white/40"> ({v.pitch > base.pitch ? "+" : ""}{v.pitch - base.pitch})</span>}</td>
                <td>{v.speed}{v.speed !== base.speed && <span className="text-white/40"> ({v.speed > base.speed ? "+" : ""}{v.speed - base.speed})</span>}</td>
                <td>{v.amplitude}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-white/60">
        To hear {character.name}, open a scene in <Link href={`/projects/${projectId}/audio`} className="text-aura-gold underline">Audio Studio</Link>, pick one of their dialogue cues and choose <b>Generate voice</b>.
        The built-in voice is free and robotic — good for timing and rhythm. A voice provider (added later) uses the same description to pick a natural voice.
      </p>
    </div>
  );
}
