"use client";

// Loads the Assets Library with its filters, the selected asset's detail, and every action on it.
// Each change re-reads from the server, so what's shown is what was saved.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
import { useRouter } from "next/navigation";
import type { Project } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { assetsApi, readFileSpecs } from "../api/assetsApi";
import type { AssetDetail, Filters, Library, VideoEditParams } from "../types";

export const EMPTY_FILTERS: Filters = { q: "", category: null, type: null, usage: "any", scene_id: null, archived: false, sort: "newest" };

export function useLibrary(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (f: Filters) => {
    const n = ++seq.current;
    const l = await assetsApi.library(projectId, f);
    if (n === seq.current) setLib(l);
  }, [projectId]);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return router.replace("/sign-in");
      try {
        const [p] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), load(EMPTY_FILTERS)]);
        setProject(p);
        const a = new URLSearchParams(window.location.search).get("asset");
        if (a && /^[0-9a-f-]{36}$/.test(a)) setSelected(a);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open the library");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, router, load]);

  // Filters re-query the server (search runs in the assetCatalogEngine there), debounced for typing.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => load(filters).catch((e) => setError(e.message)), filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters, load, loading]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    assetsApi.detail(selected).then(setDetail).catch((e) => setError(e.message));
  }, [selected]);

  // An Ask AuraStage change (name, description, tags) re-reads the list and the open file.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useAssistantChanges(() => {
    load(filtersRef.current).catch(() => undefined);
    if (selected) assetsApi.detail(selected).then(setDetail).catch(() => undefined);
  });

  // The open asset lives in the URL (?asset=<id>) so a reload or a shared link opens it again.
  const selectAsset = (id: string | null) => {
    setSelected(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("asset", id);
    else u.searchParams.delete("asset");
    window.history.replaceState(null, "", u.toString());
  };

  const run = async (label: string, fn: () => Promise<AssetDetail | void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const d = await fn();
      if (d) {
        setDetail(d);
        selectAsset(d.asset.id);
      }
      await load(filters);
      setNotice(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return {
    project, lib, filters, selected, detail, loading, busy, error, notice,
    setFilters: (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })),
    select: selectAsset,
    upload: (file: File, name: string, category: string | null) =>
      run(`Added “${name}”.`, async () => assetsApi.upload(projectId, file, { name, category, ...(await readFileSpecs(file)) })),
    replace: (file: File, note: string) =>
      run("Saved as a new version. Earlier versions are kept.", async () => assetsApi.replace(selected!, file, { note, ...(await readFileSpecs(file)) })),
    update: (patch: Record<string, unknown>, label = "Saved.") => run(label, () => assetsApi.update(selected!, patch)),
    remove: async (confirm: boolean) => {
      const id = selected;
      if (!id) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const r = await assetsApi.remove(id, confirm);
        selectAsset(null);
        await load(filters);
        setNotice(r.files_left ? `Deleted “${r.name}”. ${r.files_left} stored file(s) couldn't be removed yet — they're private and will be cleaned up.` : `Deleted “${r.name}”.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    link: (type: "scene" | "character", id: string, linked: boolean) => run(linked ? "Linked." : "Link removed.", () => assetsApi.link(selected!, type, id, linked)),
    videoEdit: (body: VideoEditParams & { note: string }) =>
      run("Video edit queued — the render worker saves it as a new version in a moment. Earlier versions are kept.", async () => {
        await assetsApi.videoEdit(selected!, body);
        return assetsApi.detail(selected!);
      }),
    /** Re-reads the list with the current filters (after a bulk delete). */
    reload: () => load(filters).catch((e) => setError(e instanceof Error ? e.message : "Could not reload the library")),
    /** Re-reads the open asset (e.g. while a video edit is being made). */
    refreshDetail: async () => { if (selected) setDetail(await assetsApi.detail(selected)); },
    clearError: () => setError(null),
  };
}
