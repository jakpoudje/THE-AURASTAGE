"use client";

// apps/web/src/modules/help-support/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Help & Support (docs/design/UI_REFERENCE.md §14, SRS §13.4). Backend: apps/api/src/modules/help.
// Opened from a workspace, it carries ?project=&module= so the assistant and tickets have context.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { helpApi, type Guide, type SystemStatus, type Trouble } from "./api/helpApi";
import { StatusPanel } from "./components/StatusPanel";
import { Assistant } from "./components/Assistant";
import { Tickets } from "./components/Tickets";
import { Guides } from "./components/Guides";
import { NotificationBell } from "@/modules/team-collaboration/components/NotificationBell";

export default function HelpSupportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [ctx, setCtx] = useState<{ project: string | null; module: string | null }>({ project: null, module: null });
  const [kb, setKb] = useState<{ guides: Guide[]; troubleshooting: Trouble[] } | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const loadStatus = useCallback(() => {
    setStatusError(null);
    helpApi.status().then(setStatus).catch((e) => setStatusError(e.message));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return router.replace(`/sign-in?next=${encodeURIComponent("/help" + window.location.search)}`);
      const p = new URLSearchParams(window.location.search);
      const project = p.get("project");
      setCtx({ project: project && /^[0-9a-f-]{36}$/.test(project) ? project : null, module: p.get("module") });
      setReady(true);
      helpApi.guides().then(setKb).catch(() => setKb({ guides: [], troubleshooting: [] }));
      loadStatus();
    })();
  }, [router, loadStatus]);

  if (!ready) return <div className="p-12 text-center text-white/50">Opening Help & Support…</div>;
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/50">
          <Link href="/dashboard" className="text-aura-gold">The AuraStage</Link> / Help & Support
          {ctx.project && <> · <Link href={`/projects/${ctx.project}/team`} className="underline">back to your project</Link></>}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/account" className="rounded-md border border-aura-border px-3 py-2 text-sm">Account & security</Link>
          <NotificationBell />
        </div>
      </header>
      <section className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Help & Support</p>
        <h1 className="mt-2 font-display text-4xl">Guidance at <span className="text-aura-gold">Every Step</span></h1>
        <p className="mt-2 max-w-2xl text-white/60">Guides for every workspace, the real status of AuraStage right now, an assistant that knows where you are, and a way to reach us.</p>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {kb ? <Guides guides={kb.guides} troubles={kb.troubleshooting} focus={ctx.module} /> : <p className="text-white/50">Loading guides…</p>}
          <Tickets projectId={ctx.project} module={ctx.module} />
        </div>
        <div className="space-y-6">
          <Assistant projectId={ctx.project} module={ctx.module} />
          <StatusPanel status={status} error={statusError} onRefresh={loadStatus} />
        </div>
      </div>
    </div>
  );
}
