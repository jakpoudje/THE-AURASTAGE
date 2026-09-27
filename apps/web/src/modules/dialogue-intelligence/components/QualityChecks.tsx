// Dialogue Quality Check (UI_REFERENCE §5): each item is a rule applied to the
// lines themselves; a clean check says so rather than showing a score.
import Link from "next/link";
import type { SceneBalance, Voiceprint } from "@aurastage/engines";

export function QualityChecks({
  balance,
  voiceprints,
  unresolved,
  projectId,
  displayName,
}: {
  displayName: (speakerKey: string, fallback: string) => string;
  balance: SceneBalance | undefined;
  voiceprints: Voiceprint[];
  unresolved: string[];
  projectId: string;
}) {
  const repeated = voiceprints.flatMap((v) => v.repeated_phrases.map((p) => ({ who: displayName(v.speaker_key, v.speaker_name), ...p })));
  const items: { ok: boolean; label: string; detail?: React.ReactNode }[] = [
    {
      ok: !balance?.flags.some((f) => f.kind === "dominant_speaker"),
      label: "Balanced exchange",
      detail: balance?.flags.find((f) => f.kind === "dominant_speaker")?.message,
    },
    {
      ok: !balance?.flags.some((f) => f.kind === "long_speech"),
      label: "No overlong speeches",
      detail: balance?.flags.filter((f) => f.kind === "long_speech").map((f) => f.message).join(" "),
    },
    {
      ok: repeated.length === 0,
      label: "No repeated phrasing",
      detail: repeated.slice(0, 3).map((r) => `${r.who} says “${r.phrase}” ${r.count}×`).join("; "),
    },
    {
      ok: unresolved.length === 0,
      label: "Every speaker is in Casting",
      detail: unresolved.length ? (
        <>
          Not yet characters: {unresolved.join(", ")}.{" "}
          <Link href={`/projects/${projectId}/casting`} className="text-aura-gold underline">
            Open Casting
          </Link>
        </>
      ) : undefined,
    },
  ];
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="text-xs uppercase tracking-widest text-aura-gold">Dialogue quality check</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2">
            <span className={i.ok ? "text-emerald-400" : "text-aura-gold"}>{i.ok ? "✓" : "!"}</span>
            <span>
              <span className={i.ok ? "" : "text-white/80"}>{i.label}</span>
              {!i.ok && i.detail && <span className="block text-[11px] text-white/50">{i.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {balance && balance.speakers.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[11px] uppercase tracking-wider text-white/40">Share of this scene's words</h4>
          <ul className="mt-2 space-y-1">
            {balance.speakers.map((s) => (
              <li key={s.speaker_key} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-white/70">{displayName(s.speaker_key, s.speaker_name)}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <span className="block h-full bg-aura-gold/70" style={{ width: `${Math.round(s.share * 100)}%` }} />
                </span>
                <span className="w-10 text-right text-white/50">{Math.round(s.share * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-white/35">≈ {balance.dialogue_seconds}s of dialogue</p>
        </div>
      )}
    </div>
  );
}
