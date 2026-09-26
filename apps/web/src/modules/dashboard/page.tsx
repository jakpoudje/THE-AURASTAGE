"use client";

// apps/web/src/modules/dashboard/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Dashboard workspace: project command centre. Reads across domains; owns no
// canonical object itself (see docs/architecture/MODULE_REGISTRY.md).

import Link from "next/link";
import { useDashboardData } from "./hooks/useDashboardData";
import { NewProjectForm } from "./components/NewProjectForm";
import { ProjectList } from "./components/ProjectList";

export default function DashboardPage() {
  const { org, projects, loading, error, createProject, signOut } = useDashboardData();

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
        </div>
        <button onClick={signOut} className="rounded-md border border-aura-border px-4 py-2 text-sm">
          Sign out
        </button>
      </header>

      <div className="mb-6">
        <NewProjectForm onCreate={createProject} />
      </div>

      <ProjectList projects={projects} />
    </div>
  );
}
