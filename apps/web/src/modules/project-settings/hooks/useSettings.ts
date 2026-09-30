"use client";

// Loads Project Settings, keeps an editable draft, previews the impact of the changes and saves a
// new version. A save made by someone else in between is refused (409) — never overwritten.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ProjectSettings } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ApiError, apiGet } from "@/lib/apiClient";
import { invalidateProjectAccess } from "@/lib/useProjectAccess";
import { settingsApi, type Impact, type SettingsView } from "../api/settingsApi";
import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";

export function useSettings(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<SettingsView | null>(null);
  const [draft, setDraft] = useState<ProjectSettings | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const v = await settingsApi.get(projectId);
    setView(v);
    setDraft(v.settings);
    return v;
  }, [projectId]);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return router.replace("/sign-in");
      try {
        const [p] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), reload()]);
        setProject(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, router, reload]);

  const dirty = !!view && !!draft && JSON.stringify(view.settings) !== JSON.stringify(draft);
  // Ask AuraStage applied or undid a settings change: show it at once, unless you have unsaved edits here (never lost).
  useAssistantChanges(() => dirty
    ? setNotice("Ask AuraStage changed the saved settings. Your unsaved edits are still here — save or reload to see its change.")
    : reload());

  return {
    project, view, draft, impact, loading, busy, error, notice, dirty,
    update: (fn: (d: ProjectSettings) => ProjectSettings) => draft && (setDraft(fn(structuredCloneSafe(draft))), setImpact(null), setNotice(null)),
    discard: () => view && (setDraft(view.settings), setImpact(null)),
    review: async () => {
      if (!draft) return;
      setBusy(true);
      setError(null);
      try {
        setImpact(await settingsApi.impact(projectId, draft));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't check the changes");
      } finally {
        setBusy(false);
      }
    },
    save: async () => {
      if (!draft || !view) return;
      setBusy(true);
      setError(null);
      try {
        const v = await settingsApi.save(projectId, view.revision, draft);
        setView(v);
        setDraft(v.settings);
        setImpact(null);
        invalidateProjectAccess(projectId);
        setNotice(`Saved as settings version ${v.version_number}.`);
      } catch (e) {
        setError(e instanceof ApiError && e.status === 409 ? `${e.message}. Your changes are still here — reload to compare.` : e instanceof Error ? e.message : "Couldn't save");
      } finally {
        setBusy(false);
      }
    },
    reload: async () => {
      setError(null);
      await reload();
    },
  };
}

const structuredCloneSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
