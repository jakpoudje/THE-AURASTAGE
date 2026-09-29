// Shot player: the selected take large, the other takes as V1..Vn, optional side-by-side compare.
import { useState } from "react";
import type { Take } from "@aurastage/contracts";

const PROVIDER: Record<string, string> = { "aurastage-sketch": "AuraStage Sketch", runway: "Runway", openai: "OpenAI",
  google: "Google", stability: "Stability AI", bfl: "Black Forest Labs FLUX", luma: "Luma", kling: "Kling", minimax: "MiniMax Hailuo" };

/** Which reference images this take actually sent to the provider, and why any were left out. */
function ReferencesUsed({ refs }: { refs: NonNullable<Take["references_used"]> }) {
  const sent = refs.filter((r) => r.sent);
  return (
    <details className="rounded border border-aura-border bg-black/30 px-3 py-2 text-xs" aria-label="References sent">
      <summary className="cursor-pointer text-white/70">
        {sent.length ? `Sent ${sent.length} reference image${sent.length === 1 ? "" : "s"}: ${sent.map((r) => r.name).join(", ")}` : "No reference images were sent"}
        {refs.length > sent.length ? ` · ${refs.length - sent.length} not sent` : ""}
      </summary>
      <ul className="mt-2 space-y-1">
        {refs.map((r) => (
          <li key={`${r.kind}:${r.object_id}:${r.asset_id}`} className={r.sent ? "text-emerald-300" : "text-white/50"}>
            {r.sent ? "✓" : "–"} {r.name} <span className="text-white/40">({r.kind} · {r.view}{r.asset_version ? ` · v${r.asset_version}` : ""})</span>
            {!r.sent && r.reason ? <span className="block pl-4 text-white/40">{r.reason}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Media({ take, className = "" }: { take: Take; className?: string }) {
  if (take.status === "queued" || take.status === "running") {
    return <div className={`flex aspect-video items-center justify-center bg-black/60 text-sm text-sky-300 ${className}`}>{take.status === "queued" ? "Waiting in the queue…" : "Generating…"}</div>;
  }
  if (take.status === "failed") return <div className={`flex aspect-video items-center justify-center bg-black/60 p-6 text-center text-sm text-red-300 ${className}`}>Failed: {take.error}</div>;
  if (take.status === "cancelled") return <div className={`flex aspect-video items-center justify-center bg-black/60 text-sm text-white/40 ${className}`}>Cancelled</div>;
  if (!take.media_url) return <div className={`flex aspect-video items-center justify-center bg-black/60 text-sm text-white/40 ${className}`}>Media not available</div>;
  return take.capability === "video" ? (
    <video src={take.media_url} controls loop className={`aspect-video w-full bg-black ${className}`} />
  ) : (
    <img src={take.media_url} alt={`Take V${take.take_number}`} className={`aspect-video w-full bg-black object-contain ${className}`} />
  );
}

export function TakeViewer({
  takes,
  busy,
  onApprove,
  onReject,
  onReopen,
  onCancel,
}: {
  takes: Take[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReopen: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const latest = [...takes].reverse()[0];
  const [selId, setSelId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const sel = takes.find((t) => t.id === selId) ?? takes.find((t) => t.approval === "approved") ?? latest;
  const other = compareId ? takes.find((t) => t.id === compareId) : null;
  if (!sel) return <div className="flex aspect-video items-center justify-center rounded-lg bg-black/40 text-sm text-white/40">No takes yet — compile the prompt and generate.</div>;

  return (
    <div className="space-y-3">
      <div className={other ? "grid grid-cols-2 gap-2" : ""}>
        <div>
          <Media take={sel} className="rounded-lg" />
          {other && <p className="mt-1 text-center text-xs text-white/50">V{sel.take_number}</p>}
        </div>
        {other && (
          <div>
            <Media take={other} className="rounded-lg" />
            <p className="mt-1 text-center text-xs text-white/50">V{other.take_number}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
        <span className="font-medium text-white/80">Take V{sel.take_number}</span>
        <span>
          {PROVIDER[sel.provider] ?? sel.provider} · {sel.model}
          {sel.seed !== null ? ` · seed ${sel.seed}` : ""}
          {sel.provider_request_id ? ` · request ${sel.provider_request_id}` : ""}
          {sel.cost_actual !== null ? ` · cost $${sel.cost_actual.toFixed(2)}` : " · cost not reported"}
        </span>
        {sel.approval === "approved" && <span className="rounded-full border border-emerald-400/50 px-2 py-0.5 text-[10px] uppercase text-emerald-300">Approved</span>}
        {sel.approval === "rejected" && <span className="rounded-full border border-red-400/40 px-2 py-0.5 text-[10px] uppercase text-red-300">Rejected</span>}
        {sel.approval === "superseded" && <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase text-white/50">Replaced</span>}
        <span className="flex-1" />
        {sel.status === "queued" && (
          <button onClick={() => onCancel(sel.id)} disabled={busy} className="rounded border border-aura-border px-3 py-1 disabled:opacity-40">
            Cancel
          </button>
        )}
        {sel.status === "succeeded" && sel.approval !== "approved" && (
          <button onClick={() => onApprove(sel.id)} disabled={busy} className="rounded bg-aura-gold px-3 py-1 font-medium text-black disabled:opacity-40">
            Approve take
          </button>
        )}
        {sel.status === "succeeded" && sel.approval === "pending" && (
          <button onClick={() => onReject(sel.id)} disabled={busy} className="rounded border border-red-500/40 px-3 py-1 text-red-300 disabled:opacity-40">
            Reject
          </button>
        )}
        {(sel.approval === "rejected" || sel.approval === "approved") && (
          <button onClick={() => onReopen(sel.id)} disabled={busy} className="rounded border border-aura-border px-3 py-1 disabled:opacity-40">
            {sel.approval === "approved" ? "Un-approve" : "Reconsider"}
          </button>
        )}
      </div>
      {sel.references_used && sel.references_used.length > 0 && <ReferencesUsed refs={sel.references_used} />}
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">Takes (click to view · shift-click to compare)</p>
        <ul className="grid grid-cols-4 gap-2" aria-label="Takes">
          {takes.map((t) => (
            <li key={t.id}>
              <button
                onClick={(e) => (e.shiftKey ? setCompareId(t.id === compareId ? null : t.id) : (setSelId(t.id), setCompareId(null)))}
                aria-label={`V${t.take_number}`}
                className={`relative w-full overflow-hidden rounded border ${sel.id === t.id ? "border-aura-gold" : compareId === t.id ? "border-sky-400" : "border-aura-border"}`}
              >
                {t.media_url && t.capability === "image" ? (
                  <img src={t.media_url} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <span className="flex aspect-video items-center justify-center bg-black/50 text-[10px] text-white/50">{t.capability === "video" && t.media_url ? "▶ video" : t.status}</span>
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">V{t.take_number}</span>
                {t.approval === "approved" && <span className="absolute right-1 top-1 rounded bg-emerald-500 px-1 text-[10px] text-black">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
