"use client";

// apps/web/src/modules/dashboard/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Dashboard workspace: project command centre. Reads across domains; owns no
// canonical object itself (see docs/architecture/MODULE_REGISTRY.md).

import Link from "next/link";
import { useDashboardData } from "./hooks/useDashboardData";
import { NewProjectForm } from "./components/NewProjectForm";
import { ProjectList } from "./components/ProjectList";
import { MyTasks } from "@/modules/team-collaboration/components/ReviewQueue";
import { NotificationBell } from "@/modules/team-collaboration/components/NotificationBell";

export default function DashboardPage() {
  const { org, role, memberships, projects, loading, error, createProject, switchOrg, signOut, me } = useDashboardData();

  if (loading) {
    return <div className="p-12 text-center text-white/50">Loading your studio…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{error}</p>
        <p className="mt-2 text-sm text-white/50">
          Is the API reachable? Check NEXT_PUBLIC_API_URL.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/50">
            <Link href="/" className="text-aura-gold">
              The AuraStage
            </Link>
            <span>/ Dashboard</span>
          </div>
          <h1 className="font-display text-3xl">{org?.name ?? "My Studio"}</h1>
          {memberships.length > 1 && (
            <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
              Studio
              <select
                aria-label="Studio"
                value={org?.id}
                onChange={(e) => switchOrg(e.target.value)}
                className="rounded-md border border-aura-border bg-black/40 px-2 py-1 text-xs"
              >
                {memberships.map((m) => (
                  <option key={m.org_id} value={m.org_id}>
                    {m.organization.name} ({m.role})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={signOut} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            Sign out
          </button>
        </div>
      </header>

      <div className="mb-6">
        {role === "member" ? (
          <p className="rounded-md border border-aura-border bg-aura-panel px-4 py-3 text-sm text-white/60" data-testid="member-note">
            These are the projects you&apos;ve been invited to. Only the studio&apos;s owners, admins and producers can start new projects.
          </p>
        ) : (
          <NewProjectForm onCreate={createProject} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <ProjectList projects={projects} />
        <MyTasks me={me} />
      </div>
    </div>
  );
}
