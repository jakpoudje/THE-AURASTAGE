// Loudness & delivery: measurement of the ACTUALLY rendered mix (BS.1770-4),
// readiness with evidence, approval and stem export. Never a guessed number.
import type { AudioScene, AudioWorkspace } from "../types";
import type { Bus } from "../state/mixEngine";

export function DeliveryPanel({
  s, target, busy, onMeasure, onApprove, onExport,
}: {
  s: AudioScene; target: AudioWorkspace["target"]; busy: string | null;
  onMeasure: () => void; onApprove: () => void; onExport: (bus?: Bus) => void;
}) {
  const m = s.measurement;
  const current = !!m && m.session_revision === s.session?.revision;
  const approvedCurrent = s.session?.status === "approved" && s.session.review_state === "current";
  const hasAudio = s.clips.some((c) => c.kind === "asset");
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <h3 className="font-display text-lg">Loudness</h3>
        <p className="mt-1 text-[11px] text-white/40">
          Target {target.integrated_lufs} LUFS ±{target.tolerance_lu}, true peak ≤ {target.max_true_peak_dbtp} dBTP (EBU R128). Measured with ITU-R BS.1770-4 on the rendered mix.
        </p>
        {m ? (
          <dl className={`mt-3 grid grid-cols-3 gap-2 text-center ${current ? "" : "opacity-50"}`} aria-label="Loudness measurement">
            <div className="rounded bg-black/40 p-2">
              <dt className="text-[10px] uppercase text-white/40">Integrated</dt>
              <dd className="text-lg tabular-nums">{m.integrated_lufs === null ? "—" : m.integrated_lufs.toFixed(1)}<span className="text-[10px] text-white/40"> LUFS</span></dd>
            </div>
            <div className="rounded bg-black/40 p-2">
              <dt className="text-[10px] uppercase text-white/40">True peak</dt>
              <dd className="text-lg tabular-nums">{m.true_peak_dbtp === null ? "—" : m.true_peak_dbtp.toFixed(1)}<span className="text-[10px] text-white/40"> dBTP</span></dd>
            </div>
            <div className="rounded bg-black/40 p-2">
              <dt className="text-[10px] uppercase text-white/40">Range</dt>
              <dd className="text-lg tabular-nums">{m.lra_lu === null ? "—" : m.lra_lu.toFixed(1)}<span className="text-[10px] text-white/40"> LU</span></dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-white/40">Not measured yet.</p>
        )}
        {m && !current && <p className="mt-2 text-xs text-aura-gold">The mix changed after this measurement — measure again.</p>}
        <button onClick={onMeasure} disabled={!hasAudio || busy !== null} className="mt-3 w-full rounded-md border border-aura-gold/60 px-4 py-2 text-sm text-aura-gold disabled:opacity-40">
          {busy === "measure" ? "Rendering and measuring…" : "Measure mix"}
        </button>
        {!hasAudio && <p className="mt-1 text-[11px] text-white/40">Add at least one recording to measure.</p>}
      </div>

      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <h3 className="font-display text-lg">Scene audio checks</h3>
        <ul className="mt-2 space-y-2 text-sm" aria-label="Audio checks">
          {s.readiness.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span aria-hidden className={r.ok ? "text-emerald-400" : r.blocking ? "text-red-400" : "text-aura-gold"}>{r.ok ? "✓" : r.blocking ? "✕" : "!"}</span>
              <span className="min-w-0">
                <span>{r.label}</span>
                {!r.blocking && !r.ok && <span className="ml-1 text-[10px] uppercase text-white/40">recommended</span>}
                <span className="block text-xs text-white/40">{r.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          onClick={onApprove}
          disabled={!s.ready_for_approval || approvedCurrent || s.session?.review_state !== "current" || busy !== null}
          className="mt-3 w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy === "approve" ? "Approving…" : approvedCurrent ? `Approved · version ${s.session!.approved_version_number} ✓` : s.session?.approved_version_number ? "Approve again (new version)" : "Approve scene mix"}
        </button>
      </div>

      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <h3 className="font-display text-lg">Export</h3>
        <p className="mt-1 text-[11px] text-white/40">WAV, 48 kHz, 16-bit — rendered from exactly what you hear.</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <button onClick={() => onExport()} disabled={!hasAudio || busy !== null} className="col-span-2 rounded border border-aura-border px-3 py-1.5 disabled:opacity-40">Full mix</button>
          {(["DX", "FX", "BG", "MX"] as Bus[]).map((b) => (
            <button key={b} onClick={() => onExport(b)} disabled={!hasAudio || busy !== null} className="rounded border border-aura-border px-3 py-1.5 disabled:opacity-40">
              {b} stem
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const STATE: Record<string, { dot: string; text: string }> = {
  configured: { dot: "text-emerald-400", text: "ready" },
  not_configured: { dot: "text-white/30", text: "add a key to connect" },
  not_connected: { dot: "text-white/30", text: "not built yet" },
};
export function GeneratorsPanel({ generators, canGenerate, busy, onGenerateCues }: {
  generators: AudioWorkspace["generators"]; canGenerate: boolean; busy: boolean; onGenerateCues: (() => void) | null;
}) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Tools & generators</h3>
      <ul className="mt-2 space-y-2 text-sm" aria-label="Audio generators">
        {generators.map((g) => (
          <li key={g.id} data-testid={`generator-${g.id}`}>
            <span className={STATE[g.state]?.dot ?? "text-white/30"}>●</span> {g.label}{" "}
            <span className="text-[11px] text-white/40">{g.execution === "native" ? (g.state === "configured" ? "built in · free" : g.state === "not_configured" ? "built in · not installed on this server" : STATE[g.state]?.text ?? g.state) : STATE[g.state]?.text ?? g.state}</span>
            <span className="block text-[11px] text-white/35">{g.note}</span>
          </li>
        ))}
      </ul>
      {onGenerateCues && (
        <button onClick={onGenerateCues} disabled={busy || !canGenerate} title={canGenerate ? undefined : "Your role can't generate audio"}
          className="mt-3 w-full rounded-md border border-aura-gold/60 px-3 py-1.5 text-xs text-aura-gold disabled:opacity-40">
          Generate all planned sounds for this scene
        </button>
      )}
      <p className="mt-2 text-[11px] text-white/35">Dialogue, ambience, effects, Foley and score cues come from the script and Scene DNA. Generated sounds go to the Assets Library; you choose where to use them.</p>
    </div>
  );
}
