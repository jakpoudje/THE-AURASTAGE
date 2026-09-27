// Scenes with Scene DNA status computed from stored records + readiness (no decorative numbers).
import type { SceneDnaEntry } from "../types";

export function dnaStatus(e: SceneDnaEntry): { label: string; tone: string } {
  const r = e.record;
  if (e.scene.status === "omitted") return { label: "Cut", tone: "border-white/15 text-white/40" };
  if (r?.review_state === "stale") return { label: "Stale", tone: "border-red-400/50 text-red-300" };
  if (r?.review_state === "review_required") return { label: "Review", tone: "border-aura-gold/60 text-aura-gold" };
  if (r?.status === "approved") return { label: "DNA Complete", tone: "border-emerald-400/50 text-emerald-300" };
  if (r) return { label: r.approved_version_id ? "Edited" : "In progress", tone: "border-sky-400/50 text-sky-300" };
  return { label: "Not started", tone: "border-white/20 text-white/50" };
}

export function SceneList({ entries, selectedId, onSelect }: { entries: SceneDnaEntry[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <h2 className="border-b border-aura-border p-4 font-display text-lg">Scenes ({entries.length})</h2>
      <ul className="max-h-[65vh] overflow-y-auto p-2">
        {entries.map((e) => {
          const st = dnaStatus(e);
          const people = e.proposal.participants.length;
          return (
            <li key={e.scene.id}>
              <button
                onClick={() => onSelect(e.scene.id)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${selectedId === e.scene.id ? "bg-aura-gold/10" : "hover:bg-white/5"}`}
              >
                <span className="w-6 shrink-0 text-xs text-white/40">{e.scene.number}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${e.scene.status === "omitted" ? "text-white/30 line-through" : ""}`}>{e.scene.heading}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase ${st.tone}`}>{st.label}</span>
                    <span className="text-[11px] text-white/40">
                      {people} {people === 1 ? "character" : "characters"} · {e.proposal.dialogue.total} {e.proposal.dialogue.total === 1 ? "line" : "lines"}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
