"use client";

// Loads and mutates the Editorial workspace. Every change goes through the API
// and the screen reloads from it, so what you see is what is stored. When the
// picture is locked, the server answers 423 with the impact; the edit is only
// retried (with break_lock) after the person confirms.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AutomationPoint, EditOperation, PictureImpact, Project } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ApiError, apiGet } from "@/lib/apiClient";
import { editorialApi } from "../api/editorialApi";
import { deliveryApi } from "@/modules/export-deliver/api/deliveryApi";
import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
import type { EditorialWorkspace } from "../types";

type Busy = null | "assemble" | "edit" | "undo" | "version" | "restore" | "lock" | "export" | "automation";
export interface PendingBreak { message: string; impact: PictureImpact[]; retry: () => Promise<unknown> }

export function useEditorial(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<EditorialWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingBreak, setPendingBreak] = useState<PendingBreak | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const w = await editorialApi.getWorkspace(projectId);
    if (alive.current) setWs(w);
    return w;
  }, [projectId]);
  // An Ask AuraStage change to the cut (a transition) re-reads the timeline.
  useAssistantChanges(() => void reload().catch(() => undefined));

  useEffect(() => {
    alive.current = true;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      try {
        const [p] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), reload()]);
        if (alive.current) setProject(p);
      } catch (err) {
        if (alive.current) setError(err instanceof Error ? err.message : "Could not load Editorial");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [projectId, router, reload]);

  async function run<T>(kind: Busy, fn: (breakLock: boolean) => Promise<T>, message: (r: T) => string | null, breakLock = false): Promise<T | null> {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const r = await fn(breakLock);
      setPendingBreak(null);
      await reload();
      const m = message(r);
      if (m) setNotice(m);
      return r;
    } catch (err) {
      if (err instanceof ApiError && err.status === 423 && !breakLock) {
        setPendingBreak({ message: err.message, impact: (err.details as PictureImpact[]) ?? [], retry: () => run(kind, fn, message, true) });
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
        if (err instanceof ApiError && err.status === 409) await reload().catch(() => null);
      }
      return null;
    } finally {
      setBusy(null);
    }
  }
  const rev = () => ws?.timeline?.revision ?? null;

  return {
    project, ws, loading, busy, error, notice, pendingBreak,
    cancelBreak: () => setPendingBreak(null),
    assemble: () => run("assemble", (b) => editorialApi.assemble(projectId, rev(), b), (r) => r.summary),
    edit: (op: EditOperation) => run("edit", (b) => editorialApi.edit(projectId, rev()!, op, b), (r) => r.summary),
    /** Takes back the newest edit (the cut before it comes back exactly); the server keeps the last 30 edits. */
    undo: () => run("undo", (b) => editorialApi.undo(projectId, rev()!, b), (r) => `${r.summary}. Undo again (Ctrl+Z) to go back further.`),
    saveVersion: (label: string) => run("version", () => editorialApi.saveVersion(projectId, label), (r) => `Saved version ${r.version_number} — “${r.label}”.`),
    restore: (versionId: string) => run("restore", (b) => editorialApi.restore(projectId, versionId, rev()!, b), (r) => r.summary),
    /** Volume automation: sound, not picture — saved against its own revision, never breaks the Picture Lock. */
    saveAutomation: (points: AutomationPoint[], summary: string) =>
      run("automation", () => editorialApi.saveAutomation(projectId, { A1: points }, ws!.timeline!.automation_revision), () => `${summary} — saved.`),
    /**
     * One click from everything approved to a watchable film (owner, 2026-10-02): build the first assembly if there is
     * none, lock the picture if it isn't, and queue a Review Copy render — each through its own endpoint, so every step
     * stays available by hand. A cut with offline slugs is refused at the lock with the reason.
     */
    testFilm: () =>
      run("lock", async () => {
        let w = await editorialApi.getWorkspace(projectId);
        const built = !w.timeline;
        if (built) { await editorialApi.assemble(projectId, null); w = await editorialApi.getWorkspace(projectId); }
        const locked = !w.timeline!.lock;
        if (locked) await editorialApi.lock(projectId, w.timeline!.revision);
        const r = await deliveryApi.createRender(projectId, { profile_id: "review_copy" });
        return { built, locked, render: r.render_id };
      }, (r) => `${r.built ? "Built the first assembly, " : ""}${r.locked ? "locked the picture and " : ""}queued a Review Copy of the whole film. Watch it in Export & Deliver when the render finishes.`),
    lock: () => run("lock", () => editorialApi.lock(projectId, rev()!), (r) => `Picture locked (lock ${r.lock_number}). Sound, subtitles and delivery can now work from this exact cut.`),
    exportEdl: async () => {
      setBusy("export");
      setError(null);
      try {
        const bytes = await editorialApi.edl(projectId);
        const url = URL.createObjectURL(new Blob([bytes], { type: "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(project?.title ?? "timeline").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "timeline"}.edl`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setNotice("Exported the cut as a CMX 3600 EDL.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(null);
      }
    },
  };
}
