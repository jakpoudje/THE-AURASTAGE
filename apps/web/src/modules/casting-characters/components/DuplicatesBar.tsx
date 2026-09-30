// Characters named twice (owner report 2026-09-30): the pairs characterDuplicateEngine finds, each with why and which
// record is kept. Merge uses the existing merge (undo from Names & Merges); "Not the same" is remembered.
import type { CastingWorkspace } from "../types";

export function DuplicatesBar({ pairs, busy, canEdit, onMerge, onDistinct }: {
  pairs: NonNullable<CastingWorkspace["duplicates"]>;
  busy: boolean;
  canEdit: boolean;
  onMerge: (mergeId: string, keepId: string) => void;
  onDistinct: (a: string, b: string, names: string) => void;
}) {
  if (!pairs.length) return null;
  return (
    <section aria-label="Possible duplicates" className="rounded-xl border border-aura-gold/40 bg-aura-gold/5 p-4">
      <h2 className="font-display text-lg text-aura-gold">Same person? {pairs.length === 1 ? "1 character looks" : `${pairs.length} characters look`} like they were named twice</h2>
      <p className="mt-1 text-xs text-white/50">Merging keeps every scene, line, look and relationship on one character, and the other name becomes an alias. You can undo a merge from Names &amp; Merges.</p>
      <ul className="mt-3 space-y-2">
        {pairs.map((p) => (
          <li key={`${p.keep_id}:${p.merge_id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-aura-border bg-black/20 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.merge_name}</span> → <span className="font-medium">{p.keep_name}</span>
              <span className="block text-xs text-white/50">{p.reason}</span>
            </span>
            <button
              disabled={busy || !canEdit}
              onClick={() => window.confirm(`Merge “${p.merge_name}” into “${p.keep_name}”? Everything on “${p.merge_name}” moves to “${p.keep_name}”.`) && onMerge(p.merge_id, p.keep_id)}
              className="rounded-md bg-aura-gold px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40"
            >
              Merge them
            </button>
            <button
              disabled={busy || !canEdit}
              onClick={() => onDistinct(p.keep_id, p.merge_id, `“${p.keep_name}” and “${p.merge_name}”`)}
              className="rounded-md border border-aura-border px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Not the same
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
