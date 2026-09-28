"use client";

// Quality control (pre-delivery checks), destinations, the live render queue and
// the exported deliverables with their per-file QC and checksums.
import type { Deliverable, DeliveryWorkspace } from "../types";

const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${b} B`);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB") : "");

export function QCPanel({ checks, busy, onRecheck }: { checks: DeliveryWorkspace["preflight"]; busy: boolean; onRecheck: () => void }) {
  const ready = checks.filter((c) => c.blocking).every((c) => c.ok);
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Quality Control & Compliance</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ready ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{ready ? "Ready to render" : "Not ready"}</span>
      </div>
      <ul className="mt-2 space-y-2 text-sm" aria-label="Delivery checks">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span aria-hidden className={c.ok ? "text-emerald-400" : c.blocking ? "text-red-400" : "text-aura-gold"}>{c.ok ? "✓" : c.blocking ? "✕" : "!"}</span>
            <span className="min-w-0">
              {c.label}
              {!c.blocking && !c.ok && <span className="ml-1 text-[10px] uppercase text-white/40">recommended</span>}
              <span className="block text-xs text-white/40">{c.evidence}</span>
            </span>
          </li>
        ))}
      </ul>
      <button onClick={onRecheck} disabled={busy} className="mt-3 w-full rounded-md border border-aura-border px-3 py-1.5 text-sm disabled:opacity-40">
        {busy ? "Checking…" : "Run full QC"}
      </button>
      <p className="mt-1 text-[11px] text-white/40">Each deliverable is also checked file by file after it renders.</p>
    </div>
  );
}

export function Destinations({ list }: { list: DeliveryWorkspace["destinations"] }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Delivery destinations</h3>
      <ul className="mt-2 space-y-1.5 text-sm" aria-label="Delivery destinations">
        {list.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-2">
            <span>
              {d.label}
              <span className="block text-[11px] text-white/40">{d.note}</span>
            </span>
            <span className={`shrink-0 text-[10px] uppercase ${d.state === "ready" ? "text-emerald-300" : "text-white/40"}`}>{d.state === "ready" ? "Ready" : "Not connected"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RenderQueue({ renders, busy, onCancel }: { renders: Deliverable[]; busy: boolean; onCancel: (id: string) => void }) {
  const active = renders.filter((r) => r.status === "queued" || r.status === "running");
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Render queue</h3>
      {!active.length ? (
        <p className="mt-2 text-sm text-white/40">Nothing rendering.</p>
      ) : (
        <ul className="mt-2 space-y-3" aria-label="Render queue">
          {active.map((r) => (
            <li key={r.id} className="rounded-lg border border-aura-border bg-black/30 p-3" aria-label={`Queued ${r.profile_label}`}>
              <div className="flex items-center justify-between text-sm">
                <span>{r.profile_label} · Picture Lock {r.lock_number}</span>
                <button onClick={() => onCancel(r.id)} disabled={busy || r.cancel_requested} className="rounded border border-red-500/40 px-2 py-0.5 text-xs text-red-300 disabled:opacity-40">
                  {r.cancel_requested ? "Cancelling…" : "Cancel"}
                </button>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-black/60" role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-aura-gold transition-all" style={{ width: `${r.progress}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-white/50">{r.status === "queued" ? "Waiting for the render worker" : `${r.stage ?? "Rendering"} · ${Math.round(r.progress)}%`}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Deliverables({ renders, onManifest }: { renders: Deliverable[]; onManifest: (id: string) => void }) {
  const done = renders.filter((r) => r.status !== "queued" && r.status !== "running");
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Exported deliverables</h3>
      {!done.length && <p className="mt-2 text-sm text-white/40">No deliverables yet.</p>}
      <ul className="mt-2 space-y-3" aria-label="Exported deliverables">
        {done.map((r) => (
          <li key={r.id} className="rounded-lg border border-aura-border bg-black/30 p-3" aria-label={`Deliverable ${r.profile_label}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{r.profile_label}</span>
              <span className="text-xs text-white/40">Picture Lock {r.lock_number} · {when(r.completed_at)}</span>
              <span className="flex-1" />
              {r.status === "succeeded" && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.qc_passed ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{r.qc_passed ? "QC passed" : "QC failed"}</span>
              )}
              {r.status !== "succeeded" && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">{r.status}</span>}
              {r.review_state === "stale" && <span className="rounded-full bg-aura-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase text-aura-gold">Out of date</span>}
            </div>
            {r.review_reason && <p className="mt-1 text-xs text-aura-gold">{r.review_reason}</p>}
            {r.error && r.status !== "succeeded" && <p className="mt-1 text-xs text-red-300">{r.error}</p>}
            {r.outputs.length > 0 && (
              <table className="mt-2 w-full text-xs">
                <thead className="text-left text-white/40">
                  <tr>
                    <th className="font-normal">File</th>
                    <th className="font-normal">Size</th>
                    <th className="font-normal">SHA-256</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {r.outputs.map((o) => (
                    <tr key={o.name} className="border-t border-aura-border/50">
                      <td className="py-1 pr-2">{o.name}</td>
                      <td className="pr-2 tabular-nums">{size(o.bytes)}</td>
                      <td className="pr-2 font-mono text-[10px] text-white/50" title={o.sha256}>{o.sha256.slice(0, 12)}…</td>
                      <td className="text-right">
                        {o.url ? (
                          <a href={o.url} download={o.download_name} className="text-aura-gold underline" aria-label={`Download ${o.name}`}>Download</a>
                        ) : (
                          <span className="text-white/40">link unavailable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-2 flex gap-3 text-[11px]">
              {r.qc && (
                <details>
                  <summary className="cursor-pointer text-white/60">QC report ({r.qc.checks.filter((c) => c.ok).length}/{r.qc.checks.length})</summary>
                  <ul className="mt-1 space-y-0.5" aria-label={`QC report ${r.profile_label}`}>
                    {r.qc.checks.map((c) => (
                      <li key={c.id}>
                        <span className={c.ok ? "text-emerald-400" : c.blocking ? "text-red-400" : "text-aura-gold"}>{c.ok ? "✓" : c.blocking ? "✕" : "!"}</span> {c.label}
                        {c.file ? <span className="text-white/40"> — {c.file}</span> : null}: <span className="text-white/50">{c.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button onClick={() => onManifest(r.id)} className="text-white/60 underline">Render manifest</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
