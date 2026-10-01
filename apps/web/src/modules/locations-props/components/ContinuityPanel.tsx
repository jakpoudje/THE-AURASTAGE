"use client";
// Set dressing and prop continuity (BUILD_PLAN §8 item 12; propContinuityEngine — free). What the script does to each prop
// (broken, bloodied, missing…) carries into later scenes until the script restores it; the prompts use the same states.
import { useState } from "react";
import type { WorldContinuity } from "../api/worldApi";

export function ContinuityPanel({ c, onOpen }: { c: WorldContinuity; onOpen: (propId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Set dressing and continuity" className="rounded-xl border border-aura-border bg-aura-panel">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm">
        <span>
          <span className="font-medium">Set dressing & prop continuity</span>
          <span className={`ml-2 ${c.warnings.length ? "text-amber-300" : "text-white/50"}`}>
            {c.warnings.length ? `${c.warnings.length} to check` : "no continuity problems found"} · {c.set_dressing.length} scenes dressed · free
          </span>
        </span>
        <span className="text-aura-gold">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-aura-border p-4 text-sm">
          {c.warnings.length > 0 && (
            <ul aria-label="Continuity to check" className="space-y-1">
              {c.warnings.map((w, k) => (
                <li key={k} className="flex items-start gap-2 text-amber-200">
                  <span aria-hidden>⚠</span><span className="flex-1">{w.message}</span>
                  <button onClick={() => onOpen(w.prop_id)} className="text-xs text-aura-gold underline">Open prop</button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">Set dressing by scene</div>
            <table className="w-full text-left text-xs">
              <tbody>
                {c.set_dressing.map((d) => (
                  <tr key={d.scene_number} className="border-t border-aura-border/50 align-top">
                    <td className="w-20 py-1.5 text-white/50">Scene {d.scene_number}</td>
                    <td className="py-1.5 text-white/80">
                      {d.items.map((it, k) => (
                        <span key={it.prop_id}>
                          {k > 0 && ", "}
                          {it.name}{it.state && <span className="text-amber-200"> ({it.state})</span>}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-white/40">States come from the script lines each prop appears on. The image prompts use the same states, so a prop broken in one scene isn&apos;t drawn whole in the next.</p>
        </div>
      )}
    </section>
  );
}
