"use client";

// Loads and mutates the Scene DNA workspace. Every change goes through the API
// and the screen reloads from it, so what you see is what is stored.

import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, UpdateSceneDnaInput } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { sceneDnaApi } from "../api/sceneDnaApi";
import type { SceneDnaWorkspace } from "../types";

type Busy = null | "save" | "approve" | "all";

export function useSceneDna(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<SceneDnaWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => setWs(await sceneDnaApi.getWorkspace(projectId)), [projectId]);
  // An Ask AuraStage change to a scene (any section) re-reads the workspace; unsaved typing stays in its draft.
  useAssistantChanges(() => reload().catch(() => undefined));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      try {
        const [p, w] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), sceneDnaApi.getWorkspace(projectId)]);
        if (cancelled) return;
        setProject(p);
        setWs(w);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Scene DNA");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  async function run(kind: Busy, fn: () => Promise<string>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      await reload();
      setNotice(msg);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    project,
    ws,
    loading,
    busy,
    error,
    notice,
    save: (sceneId: string, input: UpdateSceneDnaInput) => run("save", async () => (await sceneDnaApi.save(projectId, sceneId, input), "Scene DNA saved.")),
    /** Lock every scene that is ready, one by one through the same gated lock (owner: one click for the whole film). */
    approveAll: (sceneIds: string[]) =>
      run("all", async () => {
        let ok = 0;
        const failed: string[] = [];
        for (const sid of sceneIds) {
          try {
            await sceneDnaApi.approve(projectId, sid);
            ok++;
            setNotice(`Locking… ${ok} of ${sceneIds.length}`);
          } catch (e) {
            failed.push(e instanceof Error ? e.message : String(e));
          }
        }
        return `Locked ${ok} of ${sceneIds.length} ready scene(s).${failed.length ? ` ${failed.length} couldn't be locked: ${failed[0]}` : ""}`;
      }),
    approve: (sceneId: string) =>
      run("approve", async () => {
        const r = await sceneDnaApi.approve(projectId, sceneId);
        return `Scene DNA locked as version ${r.version_number}, with ${r.dependencies} upstream sources recorded.`;
      }),
  };
}
