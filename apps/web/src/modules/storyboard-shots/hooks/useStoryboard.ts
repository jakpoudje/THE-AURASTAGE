"use client";

// Loads and mutates the Storyboard workspace. Every change goes through the API
// and the screen reloads from it, so what you see is what is stored.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CoverageStyle, Project, ShotEditable, UpdateShotInput } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet, ApiError } from "@/lib/apiClient";
import { storyboardApi } from "../api/storyboardApi";
import type { StoryboardWorkspace } from "../types";

type Busy = null | "generate" | "shot" | "approve";

const STYLE_NAME: Record<CoverageStyle, string> = { standard: "standard", simple: "simple", intimate: "intimate", energetic: "energetic" };

export function useStoryboard(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<StoryboardWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [style, setStyle] = useState<CoverageStyle>("standard");

  const reload = useCallback(async () => setWs(await storyboardApi.getWorkspace(projectId)), [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      try {
        const [p, w] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), storyboardApi.getWorkspace(projectId)]);
        if (cancelled) return;
        setProject(p);
        setWs(w);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the storyboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  async function run<T>(kind: Busy, fn: () => Promise<T>, message: (r: T) => string): Promise<T | null> {
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
    project,
    ws,
    loading,
    busy,
    error,
    notice,
    style,
    setStyle,
    /** Plans every locked scene that has no shot plan yet; existing plans are never replaced. */
    generateAll: () =>
      run(
        "generate",
        () => storyboardApi.generateAll(projectId, style),
        (r) => {
          const planned = r.planned.length
            ? `Planned ${r.planned.length} scene${r.planned.length === 1 ? "" : "s"} with ${STYLE_NAME[style]} coverage (${r.planned.reduce((n, p) => n + p.shots, 0)} shots).`
            : "No scenes needed planning.";
          const kept = r.skipped.filter((x) => x.reason.startsWith("already")).length;
          const unlocked = r.skipped.length - kept;
          return [planned, kept ? `${kept} already planned — kept as they are.` : "", unlocked ? `${unlocked} not locked in Scene DNA yet.` : ""].filter(Boolean).join(" ");
        },
      ),
    /** Asks before replacing existing shots (the server refuses with 409 otherwise). */
    generate: async (sceneId: string) => {
      setBusy("generate");
      setError(null);
      setNotice(null);
      const once = async (replace: boolean) => {
        const r = await storyboardApi.generate(projectId, sceneId, replace, style);
        await reload();
        setNotice(`Planned ${r.shots} shots (${STYLE_NAME[style]} coverage) from Scene DNA version ${r.scene_dna_version_number}. Edit anything you like.`);
      };
      try {
        await once(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          if (window.confirm(`${err.message.replace(/ — confirm to replace them$/, "")}. Replace them with a fresh plan? An approved plan stays in history.`)) {
            try {
              await once(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
            }
          }
        } else setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    },
    addShot: (sceneId: string, shot: ShotEditable, after: number | null) =>
      run("shot", () => storyboardApi.addShot(projectId, sceneId, shot, after), (s) => `Shot ${s.ordinal} added.`),
    updateShot: (shotId: string, input: UpdateShotInput) => run("shot", () => storyboardApi.updateShot(shotId, input), (s) => `Shot ${s.ordinal} saved.`),
    moveShot: (shotId: string, dir: -1 | 1) => run("shot", () => storyboardApi.moveShot(shotId, dir), (s) => `Moved to position ${s.ordinal}.`),
    deleteShot: (shotId: string) => run("shot", () => storyboardApi.deleteShot(shotId), (r) => `Shot ${r.deleted_ordinal} removed.`),
    approve: (sceneId: string) =>
      run("approve", () => storyboardApi.approve(projectId, sceneId), (r) => `Shot plan approved as version ${r.version_number} (${Math.round(r.coverage * 100)}% of the scene covered).`),
  };
}
