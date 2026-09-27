// Scene shot timeline: one block per shot, width proportional to its duration.
import type { Shot } from "@aurastage/contracts";
import { SIZE, secs } from "../state/labels";

export function ShotTimeline({ shots, selectedId, onSelect }: { shots: Shot[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const total = shots.reduce((t, s) => t + s.duration_seconds, 0);
  if (!total) return null;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Scene shot timeline</h3>
        <span className="text-xs text-white/40">{secs(total)} of screen time</span>
      </div>
      <div className="mt-3 flex h-12 overflow-hidden rounded-md border border-aura-border" role="list" aria-label="Shot timeline">
        {shots.map((s) => (
          <button
            role="listitem"
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={`${s.ordinal}. ${SIZE[s.size].label} · ${secs(s.duration_seconds)}`}
            style={{ width: `${(s.duration_seconds / total) * 100}%` }}
            className={`min-w-[18px] border-r border-black/60 px-1 text-left text-[10px] leading-tight last:border-r-0 ${selectedId === s.id ? "bg-aura-gold text-black" : "bg-white/10 hover:bg-white/20"}`}
          >
            <span className="block truncate font-medium">{s.ordinal}</span>
            <span className="block truncate opacity-70">{SIZE[s.size].badge}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
