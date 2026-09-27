// Shot list: the same shots as a table, the way a 1st AD reads them.
import type { Shot } from "@aurastage/contracts";
import { ANGLE, MOVEMENT, SIZE, secs } from "../state/labels";

export function ShotListTable({ shots, selectedId, onSelect }: { shots: Shot[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-white/40">
          <tr>
            <th className="px-2 py-1">#</th>
            <th className="px-2 py-1">Size</th>
            <th className="px-2 py-1">Angle</th>
            <th className="px-2 py-1">Movement</th>
            <th className="px-2 py-1">Lens</th>
            <th className="px-2 py-1">Length</th>
            <th className="px-2 py-1">What we see</th>
          </tr>
        </thead>
        <tbody>
          {shots.map((s) => (
            <tr
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`cursor-pointer border-t border-aura-border ${selectedId === s.id ? "bg-aura-gold/10" : "hover:bg-white/5"}`}
            >
              <td className="px-2 py-1.5 text-white/50">{s.ordinal}</td>
              <td className="px-2 py-1.5">{SIZE[s.size].badge}</td>
              <td className="px-2 py-1.5">{ANGLE[s.angle]}</td>
              <td className="px-2 py-1.5">{MOVEMENT[s.movement]}</td>
              <td className="px-2 py-1.5">{s.lens_mm ? `${s.lens_mm}mm` : "—"}</td>
              <td className="px-2 py-1.5">{secs(s.duration_seconds)}</td>
              <td className="max-w-[28rem] truncate px-2 py-1.5 text-white/70">{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
