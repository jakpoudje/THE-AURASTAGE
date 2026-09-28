"use client";

// Clip properties: position, length, offset, gain, fades, and the recording it plays.
import { useState } from "react";
import type { AudioClip, AudioTrack, SaveAudioClipInput } from "@aurastage/contracts";
import type { AudioAsset } from "../types";

const input = "w-full rounded-md border border-aura-border bg-black/40 px-2 py-1 text-sm";

export function ClipInspector({
  clip, tracks, assets, busy, onSave, onDelete, onUpload,
}: {
  clip: AudioClip; tracks: AudioTrack[]; assets: AudioAsset[]; busy: boolean;
  onSave: (patch: SaveAudioClipInput) => void; onDelete: () => void; onUpload: (file: File) => void;
}) {
  const [f, setF] = useState({
    label: clip.label, track_id: clip.track_id, start_seconds: clip.start_seconds, duration_seconds: clip.duration_seconds, offset_seconds: clip.offset_seconds,
    gain_db: clip.gain_db, fade_in_seconds: clip.fade_in_seconds, fade_out_seconds: clip.fade_out_seconds, asset_id: clip.asset_id,
  });
  const patch = Object.fromEntries(Object.entries(f).filter(([k, v]) => (clip as unknown as Record<string, unknown>)[k] !== v)) as SaveAudioClipInput;
  const dirty = Object.keys(patch).length > 0;
  const num = (k: keyof typeof f, label: string, step = 0.1) => (
    <label className="block text-[11px] uppercase tracking-wider text-white/50">
      {label}
      <input aria-label={label} type="number" step={step} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} className={`${input} mt-1`} />
    </label>
  );
  const source = clip.source as Record<string, string>;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4" aria-label="Clip details">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-display text-lg">Clip</h3>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${clip.kind === "asset" ? "border-emerald-400/50 text-emerald-300" : "border-white/20 text-white/50"}`}>
          {clip.kind === "asset" ? "Recording" : "Planned — no audio yet"}
        </span>
      </div>
      {source?.evidence && <p className="mt-1 text-[11px] text-white/40">From: {source.evidence}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="block text-[11px] uppercase tracking-wider text-white/50 sm:col-span-2">
          Label
          <input aria-label="Label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-white/50 sm:col-span-2">
          Track
          <select aria-label="Track" value={f.track_id} onChange={(e) => setF({ ...f, track_id: e.target.value })} className={`${input} mt-1`}>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {num("start_seconds", "Start (s)")}
        {num("duration_seconds", "Length (s)")}
        {num("offset_seconds", "Offset (s)")}
        {num("gain_db", "Clip gain (dB)", 0.5)}
        {num("fade_in_seconds", "Fade in (s)")}
        {num("fade_out_seconds", "Fade out (s)")}
        <label className="block text-[11px] uppercase tracking-wider text-white/50 sm:col-span-2">
          Recording
          <select aria-label="Recording" value={f.asset_id ?? ""} onChange={(e) => setF({ ...f, asset_id: e.target.value || null })} className={`${input} mt-1`}>
            <option value="">None — keep as a planned cue</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.duration_seconds ? ` (${a.duration_seconds.toFixed(1)}s)` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-aura-gold/60 px-3 py-1.5 text-xs text-aura-gold">
          Upload a recording for this clip…
          <input
            type="file"
            accept="audio/*"
            aria-label="Upload a recording for this clip"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        <span className="flex-1" />
        <button onClick={() => window.confirm("Remove this clip from the session? Recordings stay in the Assets Library.") && onDelete()} disabled={busy} className="rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-300 disabled:opacity-40">
          Remove clip
        </button>
        <button onClick={() => onSave(patch)} disabled={!dirty || busy} className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">
          Save clip
        </button>
      </div>
    </div>
  );
}
