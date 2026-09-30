"use client";

// Loads and mutates everything the Scriptwriter workspace shows. The live
// analysis runs the same deterministic engines the API uses, so what the
// writer sees while typing matches what gets saved.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ScopePlan, UpdateProjectInput } from "@aurastage/contracts";
import { sceneBoundaryEngine, screenplayFormatEngine, screenplayImportEngine } from "@aurastage/engines";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ApiError } from "@/lib/apiClient";
import { clearDraft, readDraft, writeDraft, type LocalDraft } from "@/lib/localDraft";
import { scriptwriterApi } from "../api/scriptwriterApi";
import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
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
  /** Set when a save hit 409: someone else saved first. Lets the writer save on top of the latest. */
  const [conflict, setConflict] = useState(false);
  const [recovered, setRecovered] = useState<string | null>(null);
  /** Unsaved typing kept on this device from an older version than the current one (never shown as the script). */
  const [stale, setStale] = useState<LocalDraft | null>(null);
  const draftScope = `script:${projectId}`;
  const ready = useRef(false);

  const load = useCallback(async () => {
    const [p, ws, sp] = await Promise.all([
      scriptwriterApi.getProject(projectId),
      scriptwriterApi.getWorkspace(projectId),
      scriptwriterApi.getScopePlan(projectId),
    ]);
    setProject(p);
    setWorkspace(ws);
    setPlan(sp.plan);
    const saved = ws.current_version?.source_text ?? "";
    const local = readDraft(draftScope);
    if (local && local.text !== saved && local.base_version_id === (ws.current_version?.id ?? null)) {
      setDraft(local.text);
      setRecovered(local.saved_at);
      setStale(null);
    } else if (local && local.text !== saved) {
      // Unsaved typing from an OLDER version (e.g. before AuraScript wrote the full script) never replaces the newer
      // saved script: the editor, Scene Breakdown and Character Extraction all follow the current version, and the old
      // typing is offered separately (regression, owner 2026-09-30: steps 5–7 showed an old one-scene draft).
      setDraft(saved);
      setRecovered(null);
      setStale(local);
    } else {
      if (local) clearDraft(draftScope);
      setDraft(saved);
      setStale(null);
    }
    ready.current = true;
  }, [projectId, draftScope]);
  // A story setup filled in Ask AuraStage (free, built in) shows here at once; unsaved script typing stays a draft.
  useAssistantChanges(async () => setProject(await scriptwriterApi.getProject(projectId)));

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

  // Keep unsaved typing on this device (debounced) and warn before leaving with unsaved changes.
  const baseId = workspace?.current_version?.id ?? null;
  useEffect(() => {
    if (!ready.current) return;
    const t = setTimeout(() => {
      if (dirty) writeDraft(draftScope, { text: draft, base_version_id: baseId, saved_at: new Date().toISOString() });
      else if (!stale) clearDraft(draftScope);
    }, 400);
    return () => clearTimeout(t);
  }, [draft, dirty, baseId, draftScope, stale]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Puts the older unsaved typing into the editor; saving it later creates a newest version (nothing is overwritten). */
  function restoreStale() {
    if (!stale) return;
    setDraft(stale.text);
    setRecovered(stale.saved_at);
    setConflict(true);
    setStale(null);
  }
  function discardStale() {
    clearDraft(draftScope);
    setStale(null);
  }

  function discardRecovered() {
    clearDraft(draftScope);
    setDraft(savedText);
    setRecovered(null);
    setConflict(false);
  }

  async function run<T>(kind: "setup" | "save" | "approve", fn: () => Promise<T>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        setError("Someone saved a newer version while you were editing. Your text is safe in the editor.");
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

  const saveVersion = (note?: string, onTopOfLatest = false) =>
    run("save", async () => {
      // "Save on top of latest" re-reads the newest version and saves the writer's text after it.
      // Nothing is lost: every earlier version, including the other person's, stays in history.
      const base = onTopOfLatest ? (await scriptwriterApi.getWorkspace(projectId)).current_version?.id ?? null : baseId;
      const v = await scriptwriterApi.saveVersion(projectId, {
        source_text: draft,
        base_version_id: base,
        note: note || (onTopOfLatest ? "Saved on top of a newer version" : undefined),
      });
      setWorkspace(await scriptwriterApi.getWorkspace(projectId));
      clearDraft(draftScope);
      setConflict(false);
      setRecovered(null);
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

  /** Loads a file into the editor (not saved until the writer clicks Save version). Returns a suggested version note. */
  function importFile(fileName: string, content: string): string | null {
    setError(null);
    setNotice(null);
    try {
      const out = screenplayImportEngine({ file_name: fileName, content });
      setDraft(out.source_text);
      const scenes = sceneBoundaryEngine({ elements: screenplayFormatEngine({ source_text: out.source_text }).elements }).scenes.length;
      setNotice(
        `Imported ${fileName}: ${scenes} ${scenes === 1 ? "scene" : "scenes"} found. Review it, then click Save version.` +
          (out.warnings.length ? ` Note: ${out.warnings.join(" ")}` : "")
      );
      return `Imported from ${fileName}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that file");
      return null;
    }
  }

  return {
    /** Re-reads the project and script (after AuraScript opened a new draft version or changed story fields). */
    reload: load,
    conflict,
    recovered,
    stale,
    restoreStale,
    discardStale,
    discardRecovered,
    importFile,
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
