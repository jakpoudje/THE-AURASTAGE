"use client";

// AuraScript jobs for this project: the list (polled while anything is being written), and the actions.
import { useCallback, useEffect, useRef, useState } from "react";
import { writingApi, type RewriteMode, type WritingKind, type WritingResult } from "../api/writingApi";

export function useWriting(projectId: string) {
  const [results, setResults] = useState<WritingResult[]>([]);
  const [writer, setWriter] = useState<{ id: string; name: string; test_output: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await writingApi.list(projectId);
    setResults(r.results);
    setWriter(r.writer);
    if (timer.current) clearTimeout(timer.current);
    // Writing happens in the background; check back while anything is queued or being written.
    if (r.results.some((x) => x.status === "queued" || x.status === "running")) timer.current = setTimeout(() => load().catch(() => null), 2500);
  }, [projectId]);
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load AuraScript"));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  async function run<T>(fn: () => Promise<T>, done: (r: T) => string | null) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fn();
      await load();
      setNotice(done(r));
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const latest = (kind: WritingKind) => results.find((r) => r.kind === kind) ?? null;
  const latestDone = (kind: WritingKind) => results.find((r) => r.kind === kind && r.status === "succeeded") ?? null;
  return {
    results, writer, busy, error, notice, latest, latestDone, reload: load,
    request: (kind: WritingKind, opts: { request?: string; parent_id?: string | null; scene?: { mode: RewriteMode; number: number; instruction?: string } } = {}) =>
      run(() => writingApi.request(projectId, { kind, ...opts }), () => ({ develop_story: "Developing the story…", outline: "Building the scene outline…", write_script: "Writing the script — scenes appear as they're written.", rewrite_scene: "Reworking the scene…" })[kind]),
    saveOutline: (parentId: string | null, scenes: Parameters<typeof writingApi.saveOutline>[2]) => run(() => writingApi.saveOutline(projectId, parentId, scenes), () => "Outline saved as your own version."),
    applyStory: (id: string, fields: string[], title?: string) => run(() => writingApi.applyStory(id, fields, title), (r) => `Applied to Project Setup: ${r.applied.join(", ")}.`),
    openDraft: (id: string, base: string | null) => run(() => writingApi.openDraft(id, base), (r) => `Opened as draft version ${r.version.version_number} — review it in Edit & Refine, then approve.`),
  };
}
