"use client";

// System & provider status straight from the server's evidence (never a hardcoded green light).
import type { SystemStatus } from "../api/helpApi";

const STYLE: Record<string, string> = {
  operational: "text-emerald-300 border-emerald-500/40", degraded: "text-aura-gold border-aura-gold/50",
  down: "text-red-300 border-red-500/40", not_configured: "text-white/50 border-white/20", configured: "text-emerald-300 border-emerald-500/40",
};
const LABEL: Record<string, string> = { operational: "Operational", degraded: "Degraded", down: "Not responding", not_configured: "Not connected", configured: "Connected" };

export function StatusPanel({ status, error, onRefresh }: { status: SystemStatus | null; error: string | null; onRefresh: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">System status</h2>
          <button onClick={onRefresh} className="text-xs text-aura-gold underline">Check again</button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-300">Couldn't reach the status service: {error}</p>}
        <ul className="mt-2 space-y-2" aria-label="System status">
          {status?.checks.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 text-sm" data-testid={`status-${c.id}`}>
              <div>
                <div>{c.label}</div>
                <div className="text-[11px] text-white/50">{c.evidence}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STYLE[c.state]}`}>{LABEL[c.state]}</span>
            </li>
          ))}
        </ul>
        {status && <p className="mt-3 text-[10px] text-white/40">Checked {new Date(status.checked_at).toLocaleTimeString()}</p>}
      </div>
      <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
        <h2 className="font-display text-lg">Provider status</h2>
        <ul className="mt-2 space-y-2" aria-label="Provider status">
          {status?.providers.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <div>{p.name}</div>
                <div className="text-[11px] text-white/50">{p.capabilities.join(", ")}{p.note ? ` · ${p.note}` : ""}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STYLE[p.state]}`}>{LABEL[p.state]}</span>
            </li>
          ))}
          {status?.not_connected.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <div>{p.name}</div>
                <div className="text-[11px] text-white/50">{p.note}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STYLE.not_configured}`}>Not connected</span>
            </li>
          ))}
        </ul>
        {status && status.jobs_24h.length > 0 && (
          <div className="mt-3 border-t border-aura-border pt-2 text-[11px] text-white/60" aria-label="Jobs in the last 24 hours">
            {status.jobs_24h.map((j) => (
              <div key={j.engine_id}>{j.engine_id}: {j.completed} done · {j.failed} failed · {j.queued} waiting · {j.running} running</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
