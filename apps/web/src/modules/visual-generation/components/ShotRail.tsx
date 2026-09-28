// Scenes and shots (from approved shot plans) with status computed from stored takes.
import type { VisualWorkspace } from "../types";

export function shotStatus(s: VisualWorkspace["scenes"][number]["shots"][number]) {
  if (s.takes.some((t) => t.status === "queued" || t.status === "running")) return { label: "Generating", tone: "border-sky-400/50 text-sky-300" };
  if (s.approved_take_id) return { label: "Approved", tone: "border-emerald-400/50 text-emerald-300" };
  if (s.takes.some((t) => t.status === "succeeded")) return { label: "Generated", tone: "border-white/30 text-white/70" };
  if (s.package?.review_state && s.package.review_state !== "current") return { label: "Review", tone: "border-aura-gold/60 text-aura-gold" };
  return { label: "Pending", tone: "border-white/15 text-white/40" };
}

export function ShotRail({ ws, selectedId, onSelect }: { ws: VisualWorkspace; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <h2 className="border-b border-aura-border p-4 font-display text-lg">Shots ({ws.summary.shots})</h2>
      <div className="max-h-[70vh] overflow-y-auto p-2">
        {ws.scenes.map((sc) => (
          <div key={sc.scene.id} className="mb-2">
            <p className="px-2 py-1 text-[11px] uppercase tracking-widest text-white/40">
              Scene {sc.scene.number} · plan v{sc.plan.version_number}
              {!sc.plan.usable && <span className="ml-1 text-aura-gold">· changed</span>}
            </p>
            <ul>
              {sc.shots.map((s) => {
                const st = shotStatus(s);
                const thumb = s.takes.find((t) => t.id === s.approved_take_id) ?? [...s.takes].reverse().find((t) => t.status === "succeeded" && t.media_url);
                return (
                  <li key={s.shot.id}>
                    <button
                      onClick={() => onSelect(s.shot.id)}
                      aria-label={`Scene ${sc.scene.number} shot ${s.shot.ordinal}`}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${selectedId === s.shot.id ? "bg-aura-gold/10" : "hover:bg-white/5"}`}
                    >
                      <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-black/50 text-[10px] text-white/40">
                        {thumb?.media_url && thumb.capability === "image" ? <img src={thumb.media_url} alt="" className="h-full w-full object-cover" /> : s.shot.size}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {s.shot.ordinal}. {s.shot.description}
                        </span>
                        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase ${st.tone}`}>{st.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
