// Storyboard grid: numbered frames with size badge, duration and caption.
import type { Shot } from "@aurastage/contracts";
import { SIZE, secs } from "../state/labels";
import { ShotFrame } from "./ShotFrame";

export function StoryboardGrid({ shots, selectedId, onSelect }: { shots: Shot[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Storyboard">
      {shots.map((s) => (
        <li key={s.id}>
          <button
            onClick={() => onSelect(s.id)}
            aria-label={`Shot ${s.ordinal}`}
            className={`w-full rounded-lg border p-2 text-left ${selectedId === s.id ? "border-aura-gold" : "border-aura-border hover:border-white/30"}`}
          >
            <div className="relative">
              <ShotFrame shot={s} />
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 text-[11px] font-medium">{s.ordinal}</span>
              <span className="absolute right-1.5 top-1.5 rounded bg-aura-gold px-1.5 text-[10px] font-semibold text-black">{SIZE[s.size].badge}</span>
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 text-[10px]">{secs(s.duration_seconds)}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-white/70">{s.description}</p>
          </button>
        </li>
      ))}
    </ol>
  );
}
