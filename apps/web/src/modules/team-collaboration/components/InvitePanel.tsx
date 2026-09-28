"use client";

import { useState } from "react";
import type { Invite, ProjectRole } from "@aurastage/contracts";
import { GrantPicker } from "./GrantPicker";
import type { NewInvite } from "../hooks/useTeam";

export function InvitePanel({
  roles, canInviteToStudio, busy, link, onInvite, onClearLink,
}: {
  roles: ProjectRole[]; canInviteToStudio: boolean; busy: boolean; link: { email: string; url: string } | null;
  onInvite: (i: NewInvite) => Promise<boolean>; onClearLink: () => void;
}) {
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<"project" | "studio">("project");
  const [role, setRole] = useState("reviewer");
  const [studioRole, setStudioRole] = useState<"admin" | "producer">("producer");
  const [grants, setGrants] = useState<string[]>([]);
  const [showGrants, setShowGrants] = useState(false);
  const [copied, setCopied] = useState(false);
  const roleDef = roles.find((r) => r.id === role);
  const departments = [...new Set(roles.map((r) => r.department))];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await onInvite({ email: email.trim(), scope, project_role: role, studio_role: studioRole, grants });
    if (ok) {
      setEmail("");
      setGrants([]);
      setShowGrants(false);
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <h2 className="font-display text-lg">Invite someone</h2>
      <p className="mt-1 text-xs text-white/50">
        You'll get a private link to send them. It works once, only for that email address, and expires in 14 days.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <label htmlFor="invite-email" className="mb-1 block text-xs text-white/60">Email</label>
          <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy}
            className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold" />
        </div>
        {canInviteToStudio && (
          <div className="flex gap-2 text-xs" role="radiogroup" aria-label="Invite to">
            {(["project", "studio"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)}
                className={`rounded-md border px-3 py-1.5 ${scope === s ? "border-aura-gold text-aura-gold" : "border-aura-border text-white/60"}`}>
                {s === "project" ? "This project" : "Whole studio"}
              </button>
            ))}
          </div>
        )}
        {scope === "project" ? (
          <div>
            <label htmlFor="invite-role" className="mb-1 block text-xs text-white/60">Role on this project</label>
            <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}
              className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm">
              {departments.map((d) => (
                <optgroup key={d} label={d}>
                  {roles.filter((r) => r.department === d).map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {roleDef && <p className="mt-1 text-xs text-white/50">{roleDef.description} Everyone on a project can view and comment everywhere.</p>}
            <button type="button" onClick={() => setShowGrants((s) => !s)} className="mt-2 text-xs text-aura-gold underline">
              {showGrants ? "Hide extra permissions" : "Add extra permissions"}
            </button>
            {showGrants && <div className="mt-2"><GrantPicker rolePermissions={roleDef?.permissions ?? {}} value={grants} onChange={setGrants} disabled={busy} /></div>}
          </div>
        ) : (
          <div>
            <label htmlFor="invite-studio-role" className="mb-1 block text-xs text-white/60">Studio role</label>
            <select id="invite-studio-role" value={studioRole} onChange={(e) => setStudioRole(e.target.value as "admin" | "producer")} disabled={busy}
              className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm">
              <option value="producer">Producer — full production rights on every project</option>
              <option value="admin">Admin — everything, including the studio's people</option>
            </select>
          </div>
        )}
        <button type="submit" disabled={busy || !email.trim()} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          {busy ? "Creating…" : "Create invite link"}
        </button>
      </form>
      {link && (
        <div className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3" data-testid="invite-link">
          <div className="text-xs text-emerald-300">Invite link for {link.email} — send it to them (this is the only time it's shown):</div>
          <div className="mt-2 flex gap-2">
            <input readOnly value={link.url} aria-label="Invite link" onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-md border border-aura-border bg-black/40 px-2 py-1 font-mono text-[11px]" />
            <button type="button" onClick={() => navigator.clipboard?.writeText(link.url).then(() => setCopied(true)).catch(() => null)}
              className="rounded-md border border-aura-border px-3 py-1 text-xs">
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button type="button" onClick={onClearLink} className="text-xs text-white/50">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OpenInvites({ invites, roles, busy, onRevoke }: { invites: Invite[]; roles: ProjectRole[]; busy: string | null; onRevoke: (id: string, email: string) => void }) {
  if (!invites.length) return null;
  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <h2 className="font-display text-lg">Waiting to accept</h2>
      <ul className="mt-2 divide-y divide-aura-border text-sm">
        {invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2" data-testid={`invite-${i.email}`}>
            <div>
              <div>{i.email}</div>
              <div className="text-xs text-white/50">
                {i.org_role === "member" ? roles.find((r) => r.id === i.project_role)?.label ?? i.project_role : `Studio ${i.org_role}`} · expires{" "}
                {new Date(i.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
            </div>
            <button onClick={() => onRevoke(i.id, i.email)} disabled={busy === `invite:${i.id}`} className="rounded-md border border-aura-border px-3 py-1 text-xs text-white/70">
              Cancel invite
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
