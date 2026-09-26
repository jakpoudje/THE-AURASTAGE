"use client";

// Loads and mutates everything the Scriptwriter workspace shows. The live
// analysis runs the same deterministic engines the API uses, so what the
// writer sees while typing matches what gets saved.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ScopePlan, UpdateProjectInput } from "@aurastage/contracts";
import { sceneBoundaryEngine, screenplayFormatEngine } from "@aurastage/engines";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ApiError } from "@/lib/apiClient";
import { scriptwriterApi } from "../api/scriptwriterApi";
import type { ScriptWorkspace } from "../types";

export function useScriptwriter(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [workspace, setWorkspace] = useState<ScriptWorkspace | null>(null);
  const [plan, setPlan] = useState<ScopePlan | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "setup" | "save" | "approve">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, ws, sp] = await Promise.all([
      scriptwriterApi.getProject(projectId),
      scriptwriterApi.getWorkspace(projectId),
      scriptwriterApi.getScopePlan(projectId),
    ]);
    setProject(p);
    setWorkspace(ws);
    setPlan(sp.plan);
    setDraft(ws.current_version?.source_text ?? "");
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this project");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, router]);

  const live = useMemo(() => {
    const elements = screenplayFormatEngine({ source_text: draft }).elements;
    return { elements, ...sceneBoundaryEngine({ elements }) };
  }, [draft]);

  const savedText = workspace?.current_version?.source_text ?? "";
  const dirty = draft !== savedText;

  async function run<T>(kind: "setup" | "save" | "approve", fn: () => Promise<T>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`${err.message} Your text is still in the editor — copy it before reloading.`);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const saveSetup = (input: UpdateProjectInput) =>
    run("setup", async () => {
      if (!project) return;
      const updated = await scriptwriterApi.updateStorySetup(project, input);
      setProject(updated);
      setPlan((await scriptwriterApi.getScopePlan(projectId)).plan);
      setNotice("Story setup saved.");
    });

  const saveVersion = (note?: string) =>
    run("save", async () => {
      const v = await scriptwriterApi.saveVersion(projectId, {
        source_text: draft,
        base_version_id: workspace?.current_version?.id ?? null,
        note: note || undefined,
      });
      setWorkspace(await scriptwriterApi.getWorkspace(projectId));
      setNotice(`Saved as version ${v.version_number}.`);
    });

  const approveCurrent = () =>
    run("approve", async () => {
      const id = workspace?.current_version?.id;
      if (!id) return;
      await scriptwriterApi.approve(projectId, id);
      setWorkspace(await scriptwriterApi.getWorkspace(projectId));
      setNotice("Script approved. Scenes are now the production anchor for every later stage.");
    });

  return {
    project,
    workspace,
    plan,
    draft,
    setDraft,
    live,
    dirty,
    loading,
    busy,
    error,
    notice,
    saveSetup,
    saveVersion,
    approveCurrent,
  };
}
