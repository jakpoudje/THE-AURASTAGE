"use client";

// Loads and mutates the Casting workspace. Every change goes through the API
// and the screen reloads from it, so what you see is what is stored.

import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CharacterRole, Project, SaveWardrobeLookInput, SetRelationshipInput, UpdateCharacterInput } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { castingApi } from "../api/castingApi";
import type { CastingWorkspace } from "../types";

type Busy = null | "sync" | "save" | "alias" | "merge" | "unmerge" | "create" | "relationship" | "look";

export function useCasting(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<CastingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => setWs(await castingApi.getWorkspace(projectId)), [projectId]);
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
        const [p, w] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), castingApi.getWorkspace(projectId)]);
        if (cancelled) return;
        setProject(p);
        setWs(w);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load characters");
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
    sync: (confirm: string[] = []) =>
      run("sync", async () => {
        const { summary } = await castingApi.sync(projectId, confirm);
        return `Characters updated from the approved script: ${summary.created} new, ${summary.matched} already known.`;
      }),
    save: (id: string, input: UpdateCharacterInput) => run("save", async () => (await castingApi.update(id, input), "Character saved.")),
    addAlias: (id: string, alias: string) => run("alias", async () => (await castingApi.addAlias(id, alias), `Added "${alias}" as another name.`)),
    merge: (sourceId: string, targetId: string) =>
      run("merge", async () => (await castingApi.merge(projectId, sourceId, targetId), "Merged. You can undo this from Names & Merges.")),
    applySuggestions: () =>
      run("save", async () => {
        const r = await castingApi.applySuggestions(projectId);
        return r.updated.length
          ? `Filled empty fields for ${r.updated.length} character${r.updated.length === 1 ? "" : "s"} (${r.updated.map((u) => u.name).join(", ")}). Nothing you'd written was changed.`
          : "Nothing to fill — the script and story have no more suggestions for empty fields. Try “Develop the rest with AI”.";
      }),
    markDistinct: (a: string, b: string, names: string) => run("merge", async () => (await castingApi.markDistinct(projectId, a, b), `Kept ${names} as different people. AuraStage won't suggest merging them again.`)),
    unmerge: (id: string) => run("unmerge", async () => (await castingApi.unmerge(id), "Merge undone and scenes re-checked against the script.")),
    create: async (name: string, role: CharacterRole) => {
      let createdId: string | null = null;
      const ok = await run("create", async () => {
        createdId = (await castingApi.create(projectId, { name, role })).id;
        return `Added ${name}.`;
      });
      return ok ? createdId : null;
    },
    setRelationship: (input: SetRelationshipInput) =>
      run("relationship", async () => (await castingApi.setRelationship(projectId, input), "Relationship saved.")),
    deleteRelationship: (id: string) => run("relationship", async () => (await castingApi.deleteRelationship(id), "Relationship removed.")),
    saveLook: (characterId: string, input: SaveWardrobeLookInput) =>
      run("look", async () => (await castingApi.saveLook(characterId, input), `Look "${input.name}" saved.`)),
    deleteLook: (id: string) => run("look", async () => (await castingApi.deleteLook(id), "Look removed.")),
  };
}
