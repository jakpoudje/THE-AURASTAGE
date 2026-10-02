"use client";

// Drives and watches the area's production run (migration 0056). Any open page with the right to run it carries the run
// on, one round at a time (the server's lease makes sure only one page drives it); the others just watch. Progress per
// scene is read from the records every few seconds while something is happening, and slowly otherwise, so the page
// always shows what is going on in the background without loading the server.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductionRun, RunKind } from "@aurastage/contracts";
import { ApiError } from "@/lib/apiClient";
import { runsApi, type Area, type AreaProgress } from "./runsApi";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RECENT_MS = 10 * 60_000;

export function useProductionRun(projectId: string, area: Area, opts: { onRound?: () => void; onFinished?: (run: ProductionRun) => void } = {}) {
  const [run, setRun] = useState<ProductionRun | null>(null);
  const [progress, setProgress] = useState<AreaProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const alive = useRef(true);
  const driving = useRef<string | null>(null);
  const cb = useRef(opts);
  cb.current = opts;

  const loadProgress = useCallback(async () => {
    try { const p = await runsApi.progress(projectId, area); if (alive.current) setProgress(p); } catch { /* shown on the next read */ }
  }, [projectId, area]);
  const loadRun = useCallback(async () => {
    const r = await runsApi.list(projectId);
    const active = r.active[area];
    const recent = r.runs.find((x) => x.area === area && x.finished_at && Date.now() - new Date(x.finished_at).getTime() < RECENT_MS);
    if (alive.current) setRun(active ?? recent ?? null);
    return active;
  }, [projectId, area]);

  // Carry a running run on, round after round, until it ends or this page closes.
  const drive = useCallback(async (id: string) => {
    if (driving.current === id) return;
    driving.current = id;
    try {
      while (alive.current && driving.current === id) {
        let r;
        try { r = await runsApi.step(id); }
        catch (e) {
          if (e instanceof ApiError && e.status === 403) { setError(e.message); break; }
          await sleep(5000);
          continue;
        }
        if (!alive.current) break;
        setRun(r.run);
        cb.current.onRound?.();
        if (r.run.status !== "running") {
          if (r.run.status === "completed" || r.run.status === "failed") cb.current.onFinished?.(r.run);
          break;
        }
        await sleep(Math.max(r.driving ? 400 : 3000, r.wait_ms));
      }
    } finally {
      if (driving.current === id) driving.current = null;
      void loadProgress();
    }
  }, [loadProgress]);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const active = await loadRun();
        if (active?.status === "running") void drive(active.id);
      } catch { /* the page shows its own load errors */ }
      await loadProgress();
    })();
    return () => { alive.current = false; driving.current = null; };
  }, [loadRun, loadProgress, drive]);

  // Progress: every 5 s while a run or the generator is busy, every 30 s otherwise — and not at all while the tab is in
  // the background (2026-10-02: steady polling from open tabs added to the load that slowed the database).
  const busy = run?.status === "running" || (progress ? progress.generator.queued + progress.generator.running > 0 : false);
  useEffect(() => {
    let stop = false, t: ReturnType<typeof setTimeout>;
    const every = busy ? 5000 : 30000;
    const tick = async () => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        await loadProgress();
        if (run?.status === "paused" || (run?.status === "running" && !driving.current)) await loadRun().catch(() => null);
      }
      if (!stop) t = setTimeout(tick, every);
    };
    t = setTimeout(tick, every);
    return () => { stop = true; clearTimeout(t); };
  }, [busy, loadProgress, loadRun, run?.status]);

  const start = useCallback(async (kind: RunKind, sceneId: string | null = null) => {
    setStarting(true);
    setError(null);
    try {
      const r = await runsApi.start(projectId, kind, sceneId);
      setRun(r.run);
      if (r.joined) setError(`${r.run.started_by_label ?? "Someone"} already has a run going here — it's shown below. Pause or stop it to start a different one.`);
      if (r.run.status === "running") void drive(r.run.id);
      void loadProgress();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start");
      return null;
    } finally {
      setStarting(false);
    }
  }, [projectId, drive, loadProgress]);

  const control = useCallback(async (action: "pause" | "resume" | "stop") => {
    if (!run) return;
    setError(null);
    try {
      const r = await runsApi.control(run.id, action);
      setRun(r.run);
      if (action !== "resume") driving.current = null;
      if (r.run.status === "running") void drive(r.run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the run");
    }
  }, [run, drive]);

  return { run, progress, error, starting, start, control, refresh: loadProgress, active: run?.status === "running" || run?.status === "paused" };
}
