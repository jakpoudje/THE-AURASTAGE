"use client";

// Loads Export & Deliver and keeps the render queue live: while anything is
// waiting or rendering the workspace is re-read every 3 s (progress comes from
// the render worker's heartbeat, never estimated here).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateRenderInput, Project } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { deliveryApi } from "../api/deliveryApi";
import type { DeliveryWorkspace } from "../types";

export function useDelivery(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<DeliveryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "render" | "cancel" | "check">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const w = await deliveryApi.getWorkspace(projectId);
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
        if (alive.current) setError(err instanceof Error ? err.message : "Could not load Export & Deliver");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [projectId, router, reload]);

  const active = !!ws && ws.renders.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => reload().catch(() => null), 3000);
    return () => clearInterval(t);
  }, [active, reload]);

  async function run<T>(kind: "render" | "cancel" | "check", fn: () => Promise<T>, message: (r: T) => string | null) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      await reload();
      const m = message(r);
      if (m) setNotice(m);
      return r;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return {
    project, ws, loading, busy, error, notice,
    recheck: () => run("check", reload, () => "Checks re-run against the current Picture Lock."),
    render: (input: CreateRenderInput, label: string) =>
      run("render", () => deliveryApi.createRender(projectId, input), (r) => `${label} queued — ${r.files.length} file${r.files.length === 1 ? "" : "s"} from the current Picture Lock. It renders in the background.`),
    cancel: (id: string) => run("cancel", () => deliveryApi.cancel(id), (r) => (r.status === "cancelled" ? "Render cancelled." : "Stopping the render…")),
    downloadManifest: async (id: string) => {
      try {
        const m = await deliveryApi.manifest(id);
        const url = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `render-manifest-${id.slice(0, 8)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not download the manifest");
      }
    },
  };
}
