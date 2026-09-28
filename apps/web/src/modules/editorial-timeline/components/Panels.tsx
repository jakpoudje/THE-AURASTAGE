"use client";

// Timeline checks (with timecodes that jump to the problem), versions, Picture
// Lock and the Picture-Lock break confirmation.
import { useState } from "react";
import type { PendingBreak } from "../hooks/useEditorial";
import { tc } from "../state/timelineMath";
import type { EditorialWorkspace } from "../types";

export function QCPanel({ qc, onJump }: { qc: EditorialWorkspace["qc"]; onJump: (frame: number, clipId: string | null) => void }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-3">
      <h3 className="font-display text-lg">Timeline checks</h3>
      <ul className="mt-2 space-y-2 text-sm" aria-label="Timeline checks">
        {qc.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span aria-hidden className={c.ok ? "text-emerald-400" : c.blocking ? "text-red-400" : "text-aura-gold"}>{c.ok ? "✓" : c.blocking ? "✕" : "!"}</span>
            <span className="min-w-0">
              <span>{c.label}</span>
              {!c.blocking && !c.ok && <span className="ml-1 text-[10px] uppercase text-white/40">recommended</span>}
              <span className="block text-xs text-white/40">{c.evidence}</span>
              {!c.ok &&
                c.at.slice(0, 4).map((a, i) => (
                  <button key={i} onClick={() => onJump(a.frame, a.clip_id)} className="mr-2 block text-left font-mono text-[11px] text-sky-300 underline-offset-2 hover:underline">
                    {a.timecode} — {a.note}
                  </button>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VersionsPanel({ ws, busy, onSave, onRestore, onLock }: {
  ws: EditorialWorkspace; busy: string | null; onSave: (label: string) => void; onRestore: (id: string, label: string) => void; onLock: () => void;
}) {
  const [label, setLabel] = useState("");
  const t = ws.timeline!;
  const locked = t.status === "locked";
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-3">
      <h3 className="font-display text-lg">Picture Lock</h3>
      {locked ? (
        <p className="mt-1 rounded border border-emerald-500/40 px-2 py-1.5 text-sm text-emerald-300">
          Locked · Picture Lock {t.lock?.lock_number} ✓<span className="block text-[11px] text-emerald-300/70">Any change now asks first and records what it affects.</span>
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-white/40">A formal, unchangeable version of the cut. Needs every blocking check to pass.</p>
          <button onClick={onLock} disabled={!ws.qc.ready_for_lock || busy !== null} className="mt-2 w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">
            {busy === "lock" ? "Locking…" : "Lock picture"}
          </button>
        </>
      )}
      <h4 className="mt-4 text-sm font-medium">Versions</h4>
      <form
        className="mt-1 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) onSave(label.trim());
          setLabel("");
        }}
      >
        <input aria-label="Version name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Director's cut" className="min-w-0 flex-1 rounded border border-aura-border bg-black/40 px-2 py-1 text-xs" />
        <button disabled={!label.trim() || busy !== null} className="rounded border border-aura-border px-2 py-1 text-xs disabled:opacity-40">Save version</button>
      </form>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs" aria-label="Versions">
        {ws.versions.map((v) => (
          <li key={v.id} className="flex items-center gap-2 rounded bg-black/30 px-2 py-1">
            <span className="min-w-0 flex-1 truncate">
              v{v.version_number} · {v.label}
              <span className="block text-[10px] text-white/40">
                {v.kind === "picture_lock" ? "Picture Lock · " : v.kind === "auto" ? "Kept automatically · " : ""}
                {tc(v.duration_frames, ws.fps)}
              </span>
            </span>
            <button disabled={busy !== null} onClick={() => onRestore(v.id, v.label)} className="rounded border border-aura-border px-1.5 py-0.5 text-[10px] disabled:opacity-40">Restore</button>
          </li>
        ))}
        {!ws.versions.length && <li className="text-white/40">No saved versions yet.</li>}
      </ul>
      {ws.locks.some((l) => l.broken_at) && (
        <details className="mt-2 text-[11px] text-white/50">
          <summary className="cursor-pointer">Lock history</summary>
          {ws.locks.map((l) => (
            <p key={l.lock_number} className="mt-1">
              Lock {l.lock_number}: {new Date(l.locked_at).toLocaleString("en-GB")}
              {l.broken_at ? ` · broken ${new Date(l.broken_at).toLocaleString("en-GB")} (${(l.impact ?? []).map((i) => i.label).join(", ") || "no picture change"})` : " · current"}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}

export function BreakLockDialog({ pending, busy, onConfirm, onCancel }: { pending: PendingBreak; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" aria-label="Break Picture Lock" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-aura-gold/50 bg-aura-panel p-5">
        <h3 className="font-display text-xl text-aura-gold">The picture is locked</h3>
        <p className="mt-2 text-sm text-white/70">{pending.message}</p>
        {pending.impact.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm" aria-label="Impact">
            {pending.impact.map((i, n) => (
              <li key={n} className="rounded border border-aura-border bg-black/30 p-2">
                <span className="font-medium">{i.label}</span> <span className="text-xs uppercase text-aura-gold">{i.change}</span>
                <span className="block text-xs text-white/50">{i.evidence}</span>
                <span className="block text-xs text-white/60">Needs attention: {i.affects.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-aura-border px-4 py-2 text-sm">Keep the lock</button>
          <button onClick={onConfirm} disabled={busy} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Break Picture Lock and apply</button>
        </div>
      </div>
    </div>
  );
}
