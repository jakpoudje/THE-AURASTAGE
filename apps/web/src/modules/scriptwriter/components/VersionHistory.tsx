import type { VersionSummary } from "../types";

export function VersionHistory({
  versions,
  currentId,
  approvedId,
}: {
  versions: VersionSummary[];
  currentId: string | null;
  approvedId: string | null;
}) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="mb-3 text-xs uppercase tracking-widest text-aura-gold">Versions</h3>
      {versions.length === 0 ? (
        <p className="text-sm text-white/40">No saved versions yet.</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div>
                  v{v.version_number}
                  {v.id === currentId && <span className="ml-2 text-[10px] uppercase text-white/50">latest</span>}
                </div>
                {v.note && <div className="truncate text-xs text-white/50">{v.note}</div>}
                <div className="text-[11px] text-white/30">{new Date(v.created_at).toLocaleString()}</div>
              </div>
              {v.id === approvedId && (
                <span className="shrink-0 rounded-full border border-emerald-400/50 px-2 py-0.5 text-[10px] uppercase text-emerald-300">
                  Approved
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
