// Readiness is a predicate list with evidence (CLAUDE.md rule 12) — never a percentage.
import type { SceneDnaEntry } from "../types";

export function ReadinessPanel({
  entry,
  dirty,
  busy,
  onApprove,
}: {
  entry: SceneDnaEntry;
  dirty: boolean;
  busy: boolean;
  onApprove: () => void;
}) {
  const { proposal, record, scene } = entry;
  const lockedCurrent = record?.status === "approved" && record.review_state === "current";
  const blockingFailed = proposal.readiness.filter((r) => r.blocking && !r.ok);
  const label = lockedCurrent
    ? `Locked · version ${record!.approved_version_number} ✓`
    : record?.approved_version_id
      ? "Lock again (new version)"
      : "Lock Scene DNA";
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Readiness</h3>
      <ul className="mt-3 space-y-2" aria-label="Readiness checks">
        {proposal.readiness.map((r) => (
          <li key={r.id} className="flex gap-2 text-sm">
            <span aria-hidden className={r.ok ? "text-emerald-400" : r.blocking ? "text-red-400" : "text-aura-gold"}>
              {r.ok ? "✓" : r.blocking ? "✕" : "!"}
            </span>
            <span className="min-w-0">
              <span className={r.ok ? "text-white/80" : ""}>{r.label}</span>
              {!r.blocking && !r.ok && <span className="ml-1 text-[10px] uppercase text-white/40">recommended</span>}
              <span className="block text-xs text-white/40">{r.evidence}</span>
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={onApprove}
        disabled={busy || dirty || lockedCurrent || !proposal.ready_for_approval || scene.status !== "active"}
        className="mt-4 w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? "Locking…" : label}
      </button>
      {dirty && <p className="mt-2 text-xs text-white/50">Save your changes before locking.</p>}
      {!dirty && blockingFailed.length > 0 && <p className="mt-2 text-xs text-white/50">Fix the ✕ items first — they're needed before the scene can go to Storyboard.</p>}
      <p className="mt-3 text-[11px] text-white/30">
        Locking freezes this blueprint and records exactly which script, character, dialogue and wardrobe versions it used. If any of them change later, this scene is flagged for review.
      </p>
    </div>
  );
}
