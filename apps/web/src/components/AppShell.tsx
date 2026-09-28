"use client";

// apps/web/src/components/AppShell.tsx
// Shared workspace chrome (docs/design/UI_REFERENCE.md "Global design system"):
// fixed left sidebar, top bar with the 9-stage stepper. Owns no data; each
// module passes in the project and the active stage. Stages that aren't built
// yet are shown but not clickable, so nothing pretends to work.

import Link from "next/link";
import type { PermissionModule, Project } from "@aurastage/contracts";
import { can, roleLabel, useProjectAccess } from "@/lib/useProjectAccess";

export const STAGES = [
  { key: "scriptwriter", label: "Scriptwriter", path: "scriptwriter" },
  { key: "casting", label: "Casting & Characters", path: "casting" },
  { key: "dialogue", label: "Dialogue Intelligence", path: "dialogue" },
  { key: "scene-dna", label: "Scene DNA", path: "scene-dna" },
  { key: "storyboard", label: "Storyboard & Shots", path: "storyboard" },
  { key: "visual", label: "Visual Generation", path: "visual" },
  { key: "audio", label: "Audio Studio", path: "audio" },
  { key: "editorial", label: "Editorial & Timeline", path: "editorial" },
  { key: "export", label: "Export & Deliver", path: "export" },
] as const;

// Built secondary workspaces link to their page; the rest are shown but not clickable.
const SECONDARY: { key: string; label: string; path?: string }[] = [
  { key: "settings", label: "Project Settings" },
  { key: "team", label: "Team & Collaboration", path: "team" },
  { key: "assets", label: "Assets Library" },
  { key: "help", label: "Help & Support" },
];

type StageKey = (typeof STAGES)[number]["key"];
type ActiveKey = StageKey | "team";

// Which permission module each stage writes to (database permission gate, migration 0019).
const STAGE_MODULE: Record<StageKey, PermissionModule> = {
  scriptwriter: "script", casting: "casting", dialogue: "dialogue", "scene-dna": "scene_dna", storyboard: "shots",
  visual: "generation", audio: "audio", editorial: "editorial", export: "delivery",
};

function stageHref(projectId: string | undefined, stage: (typeof STAGES)[number]) {
  return projectId && "path" in stage ? `/projects/${projectId}/${stage.path}` : null;
}

export function AppShell({
  project,
  active,
  actions,
  children,
}: {
  project: Project | null;
  active: ActiveKey;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const access = useProjectAccess(project?.id);
  const role = roleLabel(access);
  const stageModule = active in STAGE_MODULE ? STAGE_MODULE[active as StageKey] : null;
  const viewOnly =
    !!access && !!stageModule && !["create", "edit", "generate", "approve", "lock"].some((a) => can(access, stageModule, a as never));
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-aura-border bg-aura-panel lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-aura-gold/60 font-display text-lg text-aura-gold">
            A
          </span>
          <span>
            <span className="block font-display text-base leading-none">The AuraStage</span>
            <span className="text-[9px] tracking-widest text-white/50">AI FILM PRODUCTION STUDIO</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 text-sm">
          <Link href="/dashboard" className="block rounded-md px-3 py-2 text-white/70 hover:bg-white/5">
            Dashboard
          </Link>
          {STAGES.map((s) => {
            const href = stageHref(project?.id, s);
            const isActive = s.key === active;
            const cls = isActive
              ? "block rounded-md bg-aura-gold/15 px-3 py-2 text-aura-gold"
              : href
                ? "block rounded-md px-3 py-2 text-white/70 hover:bg-white/5"
                : "flex items-center justify-between rounded-md px-3 py-2 text-white/30";
            return href ? (
              <Link key={s.key} href={href} className={cls}>
                {s.label}
              </Link>
            ) : (
              <span key={s.key} className={cls} title="Not built yet">
                {s.label}
                <span className="text-[9px] uppercase tracking-wider">Soon</span>
              </span>
            );
          })}
          <div className="my-3 border-t border-aura-border" />
          {SECONDARY.map((item) =>
            item.path && project ? (
              <Link
                key={item.key}
                href={`/projects/${project.id}/${item.path}`}
                className={
                  item.key === active ? "block rounded-md bg-aura-gold/15 px-3 py-2 text-aura-gold" : "block rounded-md px-3 py-2 text-white/70 hover:bg-white/5"
                }
              >
                {item.label}
              </Link>
            ) : (
              <span key={item.key} className="flex items-center justify-between rounded-md px-3 py-2 text-white/30" title="Not built yet">
                {item.label}
                <span className="text-[9px] uppercase tracking-wider">Soon</span>
              </span>
            )
          )}
        </nav>
        {project && (
          <div className="m-3 rounded-lg border border-aura-border bg-black/30 p-3">
            <div className="truncate font-display text-sm">{project.title}</div>
            <div className="text-[11px] text-white/50">{project.type.replace("_", " ")}</div>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-aura-border bg-aura-bg/95 px-6 py-3 backdrop-blur">
          <div className="min-w-0 shrink-0">
            <div className="truncate font-display text-base">{project?.title ?? "…"}</div>
            <div className="text-[11px] text-white/50">{project ? project.type.replace("_", " ") : ""}</div>
          </div>
          <ol className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto xl:flex">
            {STAGES.map((s, i) => {
              const isActive = s.key === active;
              return (
                <li key={s.key} className="flex items-center gap-1">
                  <span
                    title={s.label}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-1 pb-1 text-[11px] ${
                      isActive ? "border-b-2 border-aura-gold text-aura-gold" : "text-white/40"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                        isActive ? "border-aura-gold bg-aura-gold text-black" : "border-white/20"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={isActive ? "" : "hidden 2xl:inline"}>{s.label}</span>
                  </span>
                  {i < STAGES.length - 1 && <span className="text-white/20">–</span>}
                </li>
              );
            })}
          </ol>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {role && project && (
              <Link href={`/projects/${project.id}/team`} title="Your role on this project" data-testid="role-chip"
                className="rounded-full border border-aura-gold/40 px-3 py-1 text-[11px] text-aura-gold">
                {role}
              </Link>
            )}
            {actions}
          </div>
        </header>
        {viewOnly && (
          <div role="note" data-testid="view-only" className="border-b border-aura-gold/30 bg-aura-gold/10 px-6 py-2 text-xs text-aura-gold">
            View only — as {role} you can look around and comment here, but not change things. Ask the project&apos;s producer if you need more access.
          </div>
        )}
        <main>{children}</main>
      </div>
    </div>
  );
}
