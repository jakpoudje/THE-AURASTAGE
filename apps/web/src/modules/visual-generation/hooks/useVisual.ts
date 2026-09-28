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
    approve: (id: string) => run("take", () => visualApi.approve(id), (t) => `Take V${t.take_number} approved for this shot.`),
    reject: (id: string) => run("take", () => visualApi.reject(id), (t) => `Take V${t.take_number} rejected.`),
    reopen: (id: string) => run("take", () => visualApi.reopen(id), (t) => `Take V${t.take_number} reopened.`),
    cancel: (id: string) => run("take", () => visualApi.cancel(id), (t) => `Take V${t.take_number} cancelled.`),
  };
}
