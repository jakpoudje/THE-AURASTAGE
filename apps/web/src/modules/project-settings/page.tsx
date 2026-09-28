"use client";

// apps/web/src/modules/project-settings/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Project Settings (docs/design/UI_REFERENCE.md §12, SRS §13.1). Backend: apps/api/src/modules/settings.

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { can, useProjectAccess } from "@/lib/useProjectAccess";
import { useSettings } from "./hooks/useSettings";
import { DeliveryPanel, GenerationPanel, ProductionPanel, StoryPanel, StylePanel, TechnicalPanel } from "./components/Panels";

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const s = useSettings(id);
  const access = useProjectAccess(id);
  const canEdit = can(access, "settings", "edit");

  if (s.loading) return <div className="p-12 text-center text-white/50">Opening Project Settings…</div>;
  if (!s.project || !s.view || !s.draft) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{s.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">Back to dashboard</Link>
      </div>
    );
  }
  const d = s.draft;
  const disabled = !canEdit || s.busy;
  return (
    <AppShell project={s.project} active="settings"
      actions={canEdit ? (
        <button onClick={s.review} disabled={!s.dirty || s.busy} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">
          Review changes
        </button>
      ) : undefined}>
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Project Settings</p>
        <h1 className="mt-2 font-display text-4xl">Configure Your <span className="text-aura-gold">Production</span></h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Production-wide choices every stage follows. Each save is a new version; changes apply to new work and never rewrite anything already approved.
        </p>
        <p className="mt-2 text-xs text-white/40" data-testid="settings-version">
          {s.view.version_number ? `Version ${s.view.version_number} · saved ${new Date(s.view.updated_at!).toLocaleString()}` : "Using the defaults — nothing saved yet"}
        </p>
      </section>
      <div className="space-y-4 p-6">
        {!canEdit && <p className="rounded-md border border-aura-border px-4 py-2 text-sm text-white/60">Only the project's producer or the studio's owners can change these.</p>}
        {s.error && <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{s.error} <button onClick={s.reload} className="ml-2 underline">Reload</button></div>}
        {s.notice && <div role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{s.notice}</div>}
        {s.impact && (
          <div role="dialog" aria-label="What this changes" className="rounded-lg border border-aura-gold/50 bg-aura-panel p-4">
            <h2 className="font-display text-lg">What this changes</h2>
            {s.impact.impact.length ? (
              <ul className="mt-2 space-y-1 text-sm">{s.impact.impact.map((i) => <li key={i.path}><span className="text-aura-gold">{i.label}:</span> {i.effect}</li>)}</ul>
            ) : <p className="mt-2 text-sm text-white/60">No changes.</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={s.save} disabled={s.busy || !s.impact.changed.length} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Save settings</button>
              <button onClick={s.discard} className="rounded-md border border-aura-border px-4 py-2 text-sm">Discard changes</button>
            </div>
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          <StoryPanel view={s.view} projectId={id} />
          <TechnicalPanel view={s.view} d={d} update={s.update} disabled={disabled} />
          <StylePanel d={d} update={s.update} disabled={disabled} />
          <GenerationPanel view={s.view} d={d} update={s.update} disabled={disabled} />
          <DeliveryPanel view={s.view} d={d} update={s.update} disabled={disabled} />
          <ProductionPanel d={d} update={s.update} disabled={disabled} />
        </div>
        {s.view.versions.length > 0 && (
          <details className="rounded-lg border border-aura-border bg-aura-panel p-4">
            <summary className="cursor-pointer font-display text-lg">History</summary>
            <ul className="mt-2 space-y-1 text-xs text-white/60" aria-label="Settings history">
              {s.view.versions.map((v) => <li key={v.version_number}>Version {v.version_number} · {new Date(v.created_at).toLocaleString()} · {v.changed.join(", ") || "no changes"}</li>)}
            </ul>
          </details>
        )}
      </div>
    </AppShell>
  );
}
