"use client";

// apps/web/src/modules/export-deliver/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Export & Deliver workspace (docs/design/UI_REFERENCE.md §11).
// Canonical backend authority: apps/api/src/modules/rendering; renders run in workers/render-worker.
// Engines: engines/rendering (profiles, manifest, subtitles, audio mix, final QC)

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { DeliveryProfileId } from "@aurastage/contracts";
import { AppShell } from "@/components/AppShell";
import { useDelivery } from "./hooks/useDelivery";
import { Presets } from "./components/Presets";
import { Settings } from "./components/Settings";
import { Deliverables, Destinations, QCPanel, RenderQueue } from "./components/Panels";

const tcOf = (frames: number, fps: number) => {
  const s = Math.floor(frames / fps), f = frames % fps;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

export default function ExportDeliverPage() {
  const { id } = useParams<{ id: string }>();
  const d = useDelivery(id);
  const [selected, setSelected] = useState("streaming_master");

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening Export & Deliver…</div>;
  if (!d.project || !d.ws) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{d.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  const ws = d.ws;
  const lock = ws.picture_lock;
  const profile = ws.profiles.find((p) => p.id === selected) ?? ws.profiles[0];
  const ready = ws.preflight.filter((c) => c.blocking).every((c) => c.ok);

  return (
    <AppShell
      project={d.project}
      active="export"
      actions={
        <Link href={`/projects/${id}/editorial`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
          ← Editorial & Timeline
        </Link>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Export & Deliver</p>
        <h1 className="mt-2 font-display text-4xl">
          From Final Cut to <span className="text-aura-gold">Every Screen</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Every deliverable is rendered from your Picture Lock with an unchangeable manifest of exactly what went into it, then checked file by file before you download it.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Final output sources">
          {lock ? (
            <>
              <span className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-emerald-300">Picture Lock {lock.lock_number} ✓</span>
              <span className="rounded-md border border-aura-border px-3 py-1.5 text-white/60">Duration {tcOf(lock.duration_frames, lock.fps)}</span>
              <span className="rounded-md border border-aura-border px-3 py-1.5 text-white/60">{lock.fps} fps</span>
              <span className="rounded-md border border-aura-border px-3 py-1.5 text-white/60">Approved scene mixes</span>
              <span className="rounded-md border border-aura-border px-3 py-1.5 text-white/60">Subtitles from approved dialogue</span>
            </>
          ) : (
            <span className="rounded-md border border-aura-gold/50 px-3 py-1.5 text-aura-gold">
              No Picture Lock yet —{" "}
              <Link href={`/projects/${id}/editorial`} className="underline">
                lock the picture in Editorial →
              </Link>
            </span>
          )}
        </div>
        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <Presets profiles={ws.profiles} selected={profile.id} onSelect={setSelected} />
          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-xl border border-aura-border bg-black">
              {ws.preview ? (
                <video key={ws.preview.url} src={ws.preview.url} controls playsInline className="aspect-video w-full bg-black" aria-label="Preview" />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-white/40">Render a Streaming Master or Review Copy to preview it here.</div>
              )}
              {ws.preview && <p className="border-t border-aura-border px-3 py-1.5 text-xs text-white/50">Preview: {ws.preview.label}</p>}
            </div>
            <Settings
              key={profile.id}
              profile={profile}
              lockLabel={lock ? `Picture Lock ${lock.lock_number}` : null}
              canRender={ready && profile.available}
              busy={d.busy === "render"}
              onRender={(options) => d.render({ profile_id: profile.id as DeliveryProfileId, options }, profile.label)}
            />
            <RenderQueue renders={ws.renders} busy={d.busy !== null} onCancel={d.cancel} />
            <Deliverables renders={ws.renders} onManifest={d.downloadManifest} />
          </div>
          <div className="space-y-4">
            <QCPanel checks={ws.preflight} busy={d.busy === "check"} onRecheck={d.recheck} />
            <Destinations list={ws.destinations} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
