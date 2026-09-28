"use client";

// apps/web/src/modules/team-collaboration/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Team & Collaboration workspace (docs/design/UI_REFERENCE.md, SRS §13.2).
// Canonical backend authority: apps/api/src/modules/collaboration; permissions are
// enforced by the database (migration 0019), this page only shows and requests changes.

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useTeam } from "./hooks/useTeam";
import { PeopleTable } from "./components/PeopleTable";
import { InvitePanel, OpenInvites } from "./components/InvitePanel";
import { RoleGuide } from "./components/RoleGuide";
import { StudioPanel } from "./components/StudioPanel";

export default function TeamCollaborationPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTeam(id);

  if (t.loading) return <div className="p-12 text-center text-white/50">Opening Team & Collaboration…</div>;
  if (!t.project || !t.team) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{t.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">Back to dashboard</Link>
      </div>
    );
  }
  const team = t.team;
  const a = team.access;
  const myRole = a.source === "organization" ? `Studio ${a.org_role}` : a.project_role_label ?? a.project_role;

  return (
    <AppShell project={t.project} active="team">
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Team & Collaboration</p>
        <h1 className="mt-2 font-display text-4xl">
          Make Films <span className="text-aura-gold">Together</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Invite your crew, give each person the role they play on the film, and every workspace respects it — checked on the server for every change.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="my-access">
          <span className="rounded-md border border-aura-gold/50 px-3 py-1.5 text-aura-gold">Your role: {myRole}</span>
          {a.grants.length > 0 && <span className="rounded-md border border-aura-border px-3 py-1.5 text-white/60">+ {a.grants.length} extra permission{a.grants.length === 1 ? "" : "s"}</span>}
          {!team.can_manage && <span className="text-white/50">Only the project's producer or the studio's owners and admins can change the team.</span>}
        </div>

        {t.error && <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{t.error}</div>}
        {t.notice && <div role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{t.notice}</div>}

        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <PeopleTable members={team.members} roles={team.roles} me={t.me} canManage={team.can_manage} busy={t.busy}
              onSave={t.setMember} onRemove={t.removeMember} />
            {team.can_manage_studio && t.studio && (
              <StudioPanel studio={t.studio} me={t.me} myRole={a.org_role} busy={t.busy} onRole={t.setStudioRole} onRemove={t.removeFromStudio} />
            )}
            <RoleGuide roles={team.roles} />
          </div>
          <div className="space-y-4">
            {team.can_manage && (
              <InvitePanel roles={team.roles} canInviteToStudio={team.can_manage_studio} busy={t.busy === "invite"} link={t.link}
                onInvite={t.invite} onClearLink={t.clearLink} />
            )}
            <OpenInvites invites={team.invites} roles={team.roles} busy={t.busy} onRevoke={t.revokeInvite} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
