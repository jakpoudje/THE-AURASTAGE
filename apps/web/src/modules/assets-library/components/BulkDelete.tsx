"use client";

// Select-to-delete for the Assets Library (owner request 2026-10-02). Before anything is deleted the dialog says
// exactly what will happen, from the usage evidence the library already shows: how many are placed in Audio Studio
// (and which scenes' mixes go back to draft), how many are used elsewhere, and which are on the Editorial cut and
// will be skipped. Then progress is shown batch by batch.
import { useMemo, useState } from "react";
import type { LibraryAsset } from "../types";
import type { BulkProgress } from "../hooks/useBulkDelete";

export function SelectionBar(props: {
  selecting: boolean; setSelecting: (v: boolean) => void; count: number; shown: LibraryAsset[];
  selectMany: (ids: string[]) => void; clear: () => void; onDelete: () => void; disabled: boolean;
}) {
  if (!props.selecting) {
    return (
      <button onClick={() => props.setSelecting(true)} disabled={props.disabled} className="rounded-md border border-aura-border px-3 py-1.5 text-sm text-white/80 disabled:opacity-40">
        Select to delete…
      </button>
    );
  }
  return (
    <div role="toolbar" aria-label="Selection" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm">
      <span data-testid="selected-count">{props.count} selected</span>
      <button onClick={() => props.selectMany(props.shown.map((a) => a.id))} className="rounded border border-aura-border px-2 py-1 text-xs">Select all shown ({props.shown.length})</button>
      <button onClick={props.clear} disabled={!props.count} className="rounded border border-aura-border px-2 py-1 text-xs disabled:opacity-40">Clear</button>
      <span className="flex-1" />
      <button onClick={props.onDelete} disabled={!props.count || props.disabled} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
        Delete {props.count || ""} selected…
      </button>
      <button onClick={() => { props.clear(); props.setSelecting(false); }} className="rounded border border-aura-border px-2 py-1 text-xs">Done</button>
    </div>
  );
}

export function BulkDeleteDialog(props: {
  assets: LibraryAsset[]; onCancel: () => void;
  onConfirm: (opts: { confirm: boolean; remove_from_clips: boolean }) => void;
}) {
  const s = useMemo(() => {
    const placed = props.assets.filter((a) => a.usage.some((u) => u.kind === "audio_clip"));
    const onCut = props.assets.filter((a) => a.usage.some((u) => u.kind === "timeline"));
    const otherUse = props.assets.filter((a) => !onCut.includes(a) && a.usage.some((u) => u.kind !== "audio_clip" && u.kind !== "timeline"));
    const scenes = new Set(placed.flatMap((a) => a.usage.filter((u) => u.kind === "audio_clip").map((u) => u.label.split(" · ")[0])));
    return { placed, onCut, otherUse, scenes: [...scenes] };
  }, [props.assets]);
  const [offClips, setOffClips] = useState(true);
  const [sure, setSure] = useState(false);
  const n = props.assets.length;
  const skipped = s.onCut.length + (offClips ? 0 : s.placed.length);
  return (
    <div role="dialog" aria-label="Delete selected assets" className="rounded-lg border border-red-500/50 bg-aura-panel p-4 text-sm">
      <p className="font-medium text-white">Delete {n} asset{n === 1 ? "" : "s"} for good?</p>
      <p className="mt-1 text-white/60">Their files are removed from storage. This can't be undone.</p>
      <ul className="mt-2 space-y-1 text-white/70">
        {s.placed.length > 0 && (
          <li>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={offClips} onChange={(e) => setOffClips(e.target.checked)} className="mt-1" />
              <span>
                <b>{s.placed.length}</b> {s.placed.length === 1 ? "is" : "are"} placed in Audio Studio ({s.scenes.slice(0, 6).join(", ")}{s.scenes.length > 6 ? ` +${s.scenes.length - 6} more` : ""}).
                {" "}Take them off those clips too. Those scenes' mixes go back to draft, to be measured and approved again.
              </span>
            </label>
          </li>
        )}
        {s.otherUse.length > 0 && <li><b>{s.otherUse.length}</b> {s.otherUse.length === 1 ? "is" : "are"} used elsewhere (links, reference views or deliverables). Reference views can be made again; delivered files keep their own copy.</li>}
        {s.onCut.length > 0 && <li><b>{s.onCut.length}</b> {s.onCut.length === 1 ? "is" : "are"} on the Editorial timeline and will be skipped — remove {s.onCut.length === 1 ? "it" : "them"} from the cut first.</li>}
      </ul>
      <label className="mt-3 flex items-center gap-2 text-white/80">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I understand these will be deleted for good
      </label>
      <div className="mt-3 flex gap-2">
        <button disabled={!sure || skipped >= n} onClick={() => props.onConfirm({ confirm: true, remove_from_clips: offClips })}
          className="rounded-md bg-red-600 px-4 py-1.5 font-medium text-white disabled:opacity-40">
          Delete {n - skipped} asset{n - skipped === 1 ? "" : "s"}
        </button>
        <button onClick={props.onCancel} className="rounded-md border border-aura-border px-3">Cancel</button>
      </div>
    </div>
  );
}

export function BulkProgressPanel({ p, onStop, onDismiss }: { p: BulkProgress; onStop: () => void; onDismiss: () => void }) {
  const pct = p.total ? Math.round((100 * p.done) / p.total) : 0;
  return (
    <section aria-label="Deleting assets" className="rounded-lg border border-aura-border bg-aura-panel p-3 text-sm">
      <div className="flex items-center gap-2">
        {p.running && <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" aria-hidden />}
        <span className="text-white">
          {p.running ? `Deleting… ${p.done} of ${p.total} checked` : p.stopped ? `Stopped after ${p.done} of ${p.total}` : p.error ? "Stopped by a problem" : "Finished"}
          {" · "}{p.deleted} deleted{p.clips_removed ? ` · ${p.clips_removed} Audio Studio clip${p.clips_removed === 1 ? "" : "s"} removed` : ""}{p.failed.length ? ` · ${p.failed.length} skipped` : ""}
        </span>
        <span className="flex-1" />
        {p.running ? <button onClick={onStop} className="rounded border border-aura-border px-2 py-1 text-xs">Stop after this batch</button>
          : <button onClick={onDismiss} className="rounded border border-aura-border px-2 py-1 text-xs">Close</button>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {p.error && <p className="mt-2 text-amber-300">{p.error} What was already deleted stays deleted; you can try the rest again.</p>}
      {p.files_left > 0 && <p className="mt-1 text-xs text-white/50">{p.files_left} stored file(s) couldn't be removed yet — they're private and will be cleaned up.</p>}
      {p.failed.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-white/60">Skipped ({p.failed.length}) — why</summary>
          <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-white/50">
            {p.failed.map((f) => <li key={f.id}>{f.name ?? f.id}: {f.reason}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
