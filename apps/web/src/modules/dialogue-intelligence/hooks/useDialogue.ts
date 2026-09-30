"use client";

// Loads and mutates the Dialogue workspace. Every change goes through the API
// and the screen reloads from it, so what you see is what is stored.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, UpdateDialogueLineInput } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { dialogueApi } from "../api/dialogueApi";
import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
import type { DialogueWorkspace } from "../types";

type Busy = null | "sync" | "line" | "scene";

export function useDialogue(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<DialogueWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => setWs(await dialogueApi.getWorkspace(projectId)), [projectId]);
  // A suggestion applied (or undone) in Ask AuraStage shows here at once.
  useAssistantChanges(reload);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      try {
        const [p, w] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), dialogueApi.getWorkspace(projectId)]);
        if (cancelled) return;
        setProject(p);
        setWs(w);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load dialogue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  async function run(kind: Busy, fn: () => Promise<string | void>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      await reload();
      if (msg) setNotice(msg);
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
    sync: () =>
      run("sync", async () => {
        const s = await dialogueApi.sync(projectId);
        const parts = [`${s.created} new`, `${s.kept} unchanged`];
        if (s.changed) parts.push(`${s.changed} changed`);
        if (s.omitted) parts.push(`${s.omitted} no longer in the script`);
        return `Dialogue updated from the approved script: ${parts.join(", ")}.`;
      }),
    updateLine: (lineId: string, input: UpdateDialogueLineInput, message = "Line saved.") =>
      run("line", async () => (await dialogueApi.updateLine(lineId, input), message)),
    /** Approve the dialogue of every scene that still has lines to approve (the same gated approval, scene by scene). */
    approveAll: (sceneIds: string[]) =>
      run("scene", async () => {
        let ok = 0, lines = 0;
        for (const sid of sceneIds) {
          const r = await dialogueApi.approveScene(projectId, sid);
          ok++;
          lines += r.approved_lines;
        }
        return `Approved ${lines} line(s) in ${ok} scene(s).`;
      }),
    approveScene: (sceneId: string) =>
      run("scene", async () => {
        const r = await dialogueApi.approveScene(projectId, sceneId);
        return `Approved all ${r.approved_lines} lines in this scene.`;
      }),
  };
}
