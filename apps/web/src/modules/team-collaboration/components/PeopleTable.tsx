"use client";

import { useState } from "react";
import type { ProjectRole, TeamMember } from "@aurastage/contracts";
import { GrantPicker } from "./GrantPicker";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function MemberRow({
  m, roles, me, canManage, busy, onSave, onRemove,
}: {
  m: TeamMember; roles: ProjectRole[]; me: string | null; canManage: boolean; busy: boolean;
  onSave: (role: string, grants: string[]) => void; onRemove: () => void;
}) {
  const [role, setRole] = useState(m.project_role ?? "reviewer");
  const [grants, setGrants] = useState<string[]>(m.grants);
  const [open, setOpen] = useState(false);
  const dirty = role !== m.project_role || grants.join() !== m.grants.join();
  const editable = canManage && m.source === "project";
  const roleDef = roles.find((r) => r.id === role);
  return (
    <>
      <tr className="border-t border-aura-border" data-testid={`member-${m.email}`}>
        <td className="px-3 py-2">
          <div className="text-sm">{m.email}</div>
          {m.user_id === me && <div className="text-[10px] uppercase tracking-wider text-aura-gold">You</div>}
        </td>
        <td className="px-3 py-2">
          {m.source === "organization" ? (
            <span className="rounded-full border border-aura-gold/40 px-2 py-0.5 text-xs text-aura-gold" title="Full access through their studio role">
              Studio {cap(m.org_role)}
            </span>
          ) : editable ? (
            <select aria-label={`Role for ${m.email}`} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}
              className="rounded-md border border-aura-border bg-black/40 px-2 py-1 text-xs">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs">{roles.find((r) => r.id === m.project_role)?.label ?? m.project_role}</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-white/60">
          {m.source === "organization" ? "Everything" : grants.length ? grants.map((g) => g.replace(":", " · ")).join(", ") : "—"}
          {editable && (
            <button onClick={() => setOpen((o) => !o)} className="ml-2 text-aura-gold underline">
              {open ? "Hide" : "Extra permissions"}
            </button>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-white/50">{when(m.last_sign_in_at)}</td>
        <td className="px-3 py-2 text-right">
          {editable && dirty && (
            <button onClick={() => onSave(role, grants)} disabled={busy} className="mr-2 rounded-md bg-aura-gold px-3 py-1 text-xs text-black disabled:opacity-50">
              Save
            </button>
          )}
          {(editable || (m.user_id === me && m.source === "project")) && (
            <button
              onClick={() => window.confirm(m.user_id === me ? "Leave this project?" : `Remove ${m.email} from this project?`) && onRemove()}
              disabled={busy}
              className="rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-300 disabled:opacity-50"
            >
              {m.user_id === me ? "Leave" : "Remove"}
            </button>
          )}
        </td>
      </tr>
      {open && editable && (
        <tr>
          <td colSpan={5} className="px-3 pb-3">
            <p className="mb-2 text-xs text-white/50">
              {roleDef?.label}: {roleDef?.description} Tick anything extra this person should be able to do.
            </p>
            <GrantPicker rolePermissions={roleDef?.permissions ?? {}} value={grants} onChange={setGrants} disabled={busy} />
          </td>
        </tr>
      )}
    </>
  );
}

export function PeopleTable({
  members, roles, me, canManage, busy, onSave, onRemove,
}: {
  members: TeamMember[]; roles: ProjectRole[]; me: string | null; canManage: boolean; busy: string | null;
  onSave: (userId: string, role: string, grants: string[]) => void; onRemove: (userId: string, email: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-aura-border bg-aura-panel">
      <table className="w-full text-left" aria-label="People on this project">
        <thead className="text-[11px] uppercase tracking-wider text-white/40">
          <tr>
            <th className="px-3 py-2 font-normal">Person</th>
            <th className="px-3 py-2 font-normal">Role</th>
            <th className="px-3 py-2 font-normal">Extra permissions</th>
            <th className="px-3 py-2 font-normal">Last signed in</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <MemberRow key={`${m.user_id}:${m.project_role}:${m.grants.join()}`} m={m} roles={roles} me={me} canManage={canManage}
              busy={busy === `member:${m.user_id}`} onSave={(r, g) => onSave(m.user_id, r, g)} onRemove={() => onRemove(m.user_id, m.email)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
