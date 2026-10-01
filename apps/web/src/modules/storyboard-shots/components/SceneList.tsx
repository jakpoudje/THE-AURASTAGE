// Scenes with storyboard status computed from stored plans (no decorative numbers).
import type { StoryboardScene } from "../types";

export function planStatus(s: StoryboardScene): { label: string; tone: string } {
  if (s.scene.status === "omitted") return { label: "Cut", tone: "border-white/15 text-white/40" };
  if (s.plan?.review_state === "stale") return { label: "Stale", tone: "border-red-400/50 text-red-300" };
  if (s.plan?.review_state === "review_required") return { label: "Review", tone: "border-aura-gold/60 text-aura-gold" };
  if (s.plan?.status === "approved") return { label: "Approved", tone: "border-emerald-400/50 text-emerald-300" };
  if (s.plan) return { label: "Planned · approve", tone: "border-sky-400/50 text-sky-300" };
  if (s.dna.state === "locked") return { label: "Ready to plan", tone: "border-white/30 text-white/70" };
  return { label: "Lock DNA first", tone: "border-white/15 text-white/40" };
}

export function SceneList({ scenes, selectedId, onSelect }: { scenes: StoryboardScene[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <h2 className="border-b border-aura-border p-4 font-display text-lg">Scenes ({scenes.length})</h2>
      <ul className="max-h-[65vh] overflow-y-auto p-2">
        {scenes.map((s) => {
          const st = planStatus(s);
          return (
            <li key={s.scene.id}>
              <button
                onClick={() => onSelect(s.scene.id)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${selectedId === s.scene.id ? "bg-aura-gold/10" : "hover:bg-white/5"}`}
              >
                <span className="w-6 shrink-0 text-xs text-white/40">{s.scene.number}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${s.scene.status === "omitted" ? "text-white/30 line-through" : ""}`}>{s.scene.heading}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase ${st.tone}`}>{st.label}</span>
                    <span className="text-[11px] text-white/40">
                      {s.shots.length} {s.shots.length === 1 ? "shot" : "shots"}
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
