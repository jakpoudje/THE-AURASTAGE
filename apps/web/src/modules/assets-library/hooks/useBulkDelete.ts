"use client";

// Deleting many assets at once (owner request 2026-10-02: clear out generated audio). The selection is sent in batches
// of 25 with a short pause between them, so a busy database is never flooded; progress, what was deleted and what was
// skipped (with the reason) are shown as it goes, and it can be stopped between batches.
import { useRef, useState } from "react";
import { assetsApi } from "../api/assetsApi";
import type { BulkDeleteResult } from "../types";

const BATCH = 25;
const PAUSE_MS = 400;

export type BulkProgress = {
  total: number; done: number; deleted: number; clips_removed: number; files_left: number;
  failed: BulkDeleteResult["failed"]; running: boolean; stopped: boolean; error: string | null;
};

export function useBulkDelete(projectId: string, onFinished: () => Promise<void> | void) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const stop = useRef(false);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const run = async (ids: string[], opts: { confirm: boolean; remove_from_clips: boolean }) => {
    stop.current = false;
    const p: BulkProgress = { total: ids.length, done: 0, deleted: 0, clips_removed: 0, files_left: 0, failed: [], running: true, stopped: false, error: null };
    setProgress({ ...p });
    for (let i = 0; i < ids.length; i += BATCH) {
      if (stop.current) { p.stopped = true; break; }
      const batch = ids.slice(i, i + BATCH);
      try {
        const r = await assetsApi.removeMany(projectId, { asset_ids: batch, ...opts });
        p.deleted += r.deleted.length;
        p.clips_removed += r.clips_removed;
        p.files_left += r.files_left;
        p.failed = [...p.failed, ...r.failed];
        setSelected((s) => {
          const n = new Set(s);
          for (const d of r.deleted) n.delete(d.id);
          return n;
        });
      } catch (e) {
        // A whole batch failing (no permission, server busy) stops the run; what was already deleted stays deleted.
        p.error = e instanceof Error ? e.message : "Something went wrong";
        break;
      } finally {
        p.done = Math.min(ids.length, i + batch.length);
        setProgress({ ...p });
      }
      if (i + BATCH < ids.length) await new Promise((ok) => setTimeout(ok, PAUSE_MS));
    }
    p.running = false;
    setProgress({ ...p });
    await onFinished();
  };

  return {
    selected, toggle, progress,
    selectMany: (ids: string[]) => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
    run,
    stop: () => void (stop.current = true),
    dismiss: () => setProgress(null),
  };
}
