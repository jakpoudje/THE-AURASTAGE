"use client";

import type { StudioTeam } from "../types";
import { STUDIO_ROLE_HELP } from "../types";

export function StudioPanel({
  studio, me, myRole, busy, onRole, onRemove,
}: {
  studio: StudioTeam; me: string | null; myRole: string | null; busy: string | null;
  onRole: (userId: string, role: string) => void; onRemove: (userId: string, email: string) => void;
}) {
  const isOwner = myRole === "owner";
  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <h2 className="font-display text-lg">Everyone in the studio</h2>
      <p className="mt-1 text-xs text-white/50">
        Studio owners, admins and producers can work on every project. Members only see the projects they're added to.
      </p>
      <table className="mt-3 w-full text-left text-sm" aria-label="Studio people">
        <tbody>
          {studio.members.map((m) => {
            const locked = !isOwner && m.org_role === "owner";
            return (
              <tr key={m.user_id} className="border-t border-aura-border" data-testid={`studio-${m.email}`}>
                <td className="py-2 pr-2">
                  {m.email} {m.user_id === me && <span className="text-[10px] uppercase tracking-wider text-aura-gold">You</span>}
                  <div className="text-xs text-white/40">{m.org_role === "member" ? `${m.projects} project${m.projects === 1 ? "" : "s"}` : STUDIO_ROLE_HELP[m.org_role]}</div>
                </td>
                <td className="py-2 pr-2">
                  <select aria-label={`Studio role for ${m.email}`} value={m.org_role} disabled={locked || busy === `studio:${m.user_id}`}
                    onChange={(e) => onRole(m.user_id, e.target.value)} className="rounded-md border border-aura-border bg-black/40 px-2 py-1 text-xs">
                    {(isOwner ? ["owner", "admin", "producer", "member"] : ["admin", "producer", "member"].concat(m.org_role === "owner" ? ["owner"] : [])).map((r) => (
                      <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right">
                  {!locked && m.user_id !== me && (
                    <button onClick={() => window.confirm(`Remove ${m.email} from the studio and all its projects?`) && onRemove(m.user_id, m.email)}
                      disabled={busy === `studio:${m.user_id}`} className="rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-300">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
