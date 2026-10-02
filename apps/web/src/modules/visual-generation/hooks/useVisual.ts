"use client";

// Loads and mutates the Visual Generation workspace. While any take is waiting
// or running, it re-reads the workspace every few seconds so finished takes appear.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, RequestTakeInput } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { visualApi } from "../api/visualApi";
import type { VisualWorkspace } from "../types";

type Busy = null | "compile" | "generate" | "take";

export function useVisual(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<VisualWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const w = await visualApi.getWorkspace(projectId);
    if (alive.current) setWs(w);
    return w;
  }, [projectId]);

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
        if (alive.current) setError(err instanceof Error ? err.message : "Could not load Visual Generation");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [projectId, router, reload]);

  // Poll while work is in flight (the worker finishes takes in the background).
  const inFlight = !!ws && ws.queue.waiting + ws.queue.running > 0;
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void reload().catch(() => undefined), 3000);
    return () => clearInterval(t);
  }, [inFlight, reload]);

  async function run<T>(kind: Busy, fn: () => Promise<T>, message: (r: T) => string) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      await reload();
      setNotice(message(r));
      return r;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return {
    project, ws, loading, busy, error, notice, inFlight,
    compile: (shotId: string, aspect: string) => run("compile", () => visualApi.compile(projectId, shotId, aspect), () => "Prompt compiled from the approved shot plan."),
    generate: (packageId: string, input: Partial<RequestTakeInput>) =>
      run("generate", () => visualApi.requestTakes(packageId, input), (r) => `Queued ${r.takes.length} ${r.takes.length === 1 ? "take" : "takes"}. They appear here when ready.`),
    // Whole film, in rounds: the server works for up to ~25 s per call and says how many remain; we call again until
    // none do, showing progress, so a long film never hits a time limit (owner report 2026-10-02).
    compileAll: () => run("compile", async () => {
      let compiled = 0, already = 0, waiting: number[] = [], failed: string[] = [];
      for (let round = 0; round < 40; round++) {
        const r = await visualApi.compileAll(projectId);
        compiled += r.compiled; if (round === 0) already = r.already; waiting = r.waiting_scenes; failed = [...failed, ...(r.failed ?? [])];
        if (!r.remaining || !r.compiled) break;
        setNotice(`Compiling prompts… ${compiled} done, ${r.remaining} to go.`);
      }
      return { compiled, already, waiting, failed };
    }, (r) =>
      `${r.compiled ? `Compiled ${r.compiled} shot prompt${r.compiled === 1 ? "" : "s"}` : "Every shot's prompt is already up to date"}${r.compiled && r.already ? ` (${r.already} already up to date)` : ""}.${r.waiting.length ? ` Scene${r.waiting.length === 1 ? "" : "s"} ${r.waiting.join(", ")} need their shot plan approved again in Storyboard.` : ""}${r.failed.length ? ` Not compiled: ${r.failed.slice(0, 3).join("; ")}.` : ""}`),
    sketchAll: () => run("generate", async () => {
      let requested = 0, already = 0, needs = 0;
      for (let round = 0; round < 40; round++) {
        const r = await visualApi.sketchAll(projectId);
        requested += r.requested; if (round === 0) { already = r.already; needs = r.needs_prompt; }
        if (!r.remaining || !r.requested) break;
        setNotice(`Queuing sketches… ${requested} queued, ${r.remaining} to go.`);
      }
      return { requested, already, needs };
    }, (r) =>
      `${r.requested ? `Sketching ${r.requested} shot${r.requested === 1 ? "" : "s"} with AuraStage Sketch (free) in the background.` : "No shots need a sketch."}${r.already ? ` ${r.already} already have a take.` : ""}${r.needs ? ` ${r.needs} need their prompt compiled first.` : ""}`),
    approveAll: () => run("take", async () => {
      let approved = 0, waiting = 0;
      for (let round = 0; round < 40; round++) {
        const r = await visualApi.approveAll(projectId);
        approved += r.approved; waiting = r.waiting;
        if (!r.remaining || !r.approved) break;
        setNotice(`Approving… ${approved} done, ${r.remaining} to go.`);
      }
      return { approved, waiting };
    }, (r) =>
      `Approved a take for ${r.approved} shot${r.approved === 1 ? "" : "s"} (the newest finished one; rejected takes are never chosen).${r.waiting ? ` ${r.waiting} shot${r.waiting === 1 ? " has" : "s have"} no finished take yet.` : ""} Change any of them on its shot.`),
    approve: (id: string) => run("take", () => visualApi.approve(id), (t) => `Take V${t.take_number} approved for this shot.`),
    reject: (id: string) => run("take", () => visualApi.reject(id), (t) => `Take V${t.take_number} rejected.`),
    reopen: (id: string) => run("take", () => visualApi.reopen(id), (t) => `Take V${t.take_number} reopened.`),
    cancel: (id: string) => run("take", () => visualApi.cancel(id), (t) => `Take V${t.take_number} cancelled.`),
  };
}
