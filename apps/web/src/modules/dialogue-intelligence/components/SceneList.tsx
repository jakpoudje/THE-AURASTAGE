// Scenes with dialogue status computed from the stored lines (no decorative numbers).
import type { DialogueLine } from "@aurastage/contracts";
import type { DialogueScene } from "../types";

export function sceneStatus(lines: DialogueLine[]): { label: string; tone: string } {
  const active = lines.filter((l) => l.status === "active");
  if (active.length === 0) return { label: "No dialogue", tone: "border-white/15 text-white/40" };
  if (lines.some((l) => l.review_state === "review_required")) return { label: "Review", tone: "border-aura-gold/60 text-aura-gold" };
  if (active.every((l) => l.approval === "approved")) return { label: "Approved", tone: "border-emerald-400/50 text-emerald-300" };
  if (active.some((l) => l.emotion || l.intention || l.subtext || l.approval === "approved")) return { label: "In progress", tone: "border-sky-400/50 text-sky-300" };
  return { label: "Not started", tone: "border-white/20 text-white/50" };
}

export function SceneList({
  scenes,
  lines,
  selectedId,
  onSelect,
}: {
  scenes: DialogueScene[];
  lines: DialogueLine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <h2 className="border-b border-aura-border p-4 font-display text-lg">Scenes ({scenes.length})</h2>
      <ul className="max-h-[65vh] overflow-y-auto p-2">
        {scenes.map((s) => {
          const mine = lines.filter((l) => l.scene_id === s.id);
          const st = sceneStatus(mine);
          const n = mine.filter((l) => l.status === "active").length;
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${selectedId === s.id ? "bg-aura-gold/10" : "hover:bg-white/5"}`}
              >
                <span className="w-6 shrink-0 text-xs text-white/40">{s.number}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${s.status === "omitted" ? "text-white/30 line-through" : ""}`}>{s.heading}</span>
                  <span className="text-[11px] text-white/40">
                    {n} {n === 1 ? "line" : "lines"}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase ${st.tone}`}>{st.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
