"use client";

// Clip properties: position, length, offset, gain, fades, and the recording it plays.
import { useState } from "react";
import type { AudioClip, AudioTrack, SaveAudioClipInput } from "@aurastage/contracts";
import type { AudioAsset, AudioGeneration } from "../types";
import { audioApi } from "../api/audioApi";

/** Which kind of sound a planned cue on this track family is (mirrors the API's FAMILY_KIND). */
const FAMILY_KIND: Record<string, AudioGeneration["kind"]> = { BG: "ambience", WALLA: "ambience", FX: "fx", FOLEY: "foley", SCORE: "score", MX: "score", DX: "voice", VO: "voice", ADR: "voice" };
const STATUS: Record<AudioGeneration["status"], string> = { queued: "Waiting…", running: "Generating…", succeeded: "Ready", failed: "Failed" };

function Listen({ assetId }: { assetId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  return url ? <audio controls autoPlay src={url} className="h-8 w-48" aria-label="Generated sound" />
    : <button onClick={async () => setUrl(URL.createObjectURL(new Blob([await audioApi.assetBytes(assetId)], { type: "audio/wav" })))} className="rounded border border-aura-border px-2 py-0.5">▶ Listen</button>;
}

const input = "w-full rounded-md border border-aura-border bg-black/40 px-2 py-1 text-sm";

export function ClipInspector({
  clip, tracks, assets, busy, onSave, onDelete, onUpload, generations = [], canGenerate = false, onGenerate, voiceReady = false,
}: {
  clip: AudioClip; tracks: AudioTrack[]; assets: AudioAsset[]; busy: boolean;
  onSave: (patch: SaveAudioClipInput) => void; onDelete: () => void; onUpload: (file: File) => void;
  generations?: AudioGeneration[]; canGenerate?: boolean; onGenerate?: (body: { clip_id: string; kind: AudioGeneration["kind"]; description: string; duration_seconds: number }) => void;
  /** The built-in (or a connected) voice generator is available on the server. */
  voiceReady?: boolean;
}) {
  const family = tracks.find((t) => t.id === clip.track_id)?.family;
  const genKind = family ? FAMILY_KIND[family] : undefined;
  const [genText, setGenText] = useState(clip.label);
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
      {genKind === "voice" && onGenerate && voiceReady && (clip.source as Record<string, unknown>)?.dialogue_line_id != null && (
        <section aria-label="Generate this voice" className="mt-3 rounded-md border border-aura-border p-3 text-xs">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">Generate this line's voice</div>
          <p className="text-white/60">Speaks the line from the approved script in the character's Voice DNA (from their Casting profile), shaped by the line's emotion.</p>
          <button onClick={() => onGenerate({ clip_id: clip.id, kind: "voice", description: "", duration_seconds: Math.min(300, clip.duration_seconds) })}
            disabled={busy || !canGenerate} title={canGenerate ? undefined : "Your role can't generate audio"}
            className="mt-2 rounded-md border border-aura-gold/60 px-3 py-1.5 text-aura-gold disabled:opacity-40">Generate voice</button>
          {generations.length > 0 && (
            <ul aria-label="Generated for this cue" className="mt-2 space-y-1">
              {generations.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2" data-testid="generation">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${g.status === "succeeded" ? "border-emerald-400/50 text-emerald-300" : g.status === "failed" ? "border-red-400/50 text-red-300" : "border-white/20 text-white/50"}`}>{STATUS[g.status]}</span>
                  <span className="text-white/60">{g.execution === "native" ? "Built-in voice (robotic)" : g.provider}{g.layers.length ? ` · ${g.layers.map((l) => l.name.replace(/^Voice: /, "")).join(", ")}` : ""}</span>
                  {g.error && <span className="text-red-300">{g.error}</span>}
                  {g.asset_id && <Listen assetId={g.asset_id} />}
                  {g.asset_id && (clip.asset_id === g.asset_id
                    ? <span className="text-emerald-300">In use</span>
                    : <button onClick={() => onSave({ asset_id: g.asset_id!, label: clip.label })} disabled={busy} className="rounded bg-aura-gold px-2 py-0.5 font-medium text-black">Use this</button>)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-white/35">The built-in voice is free and robotic — good for timing and rhythm. Replace it with a recording or a voice provider for the film.</p>
        </section>
      )}
      {genKind && genKind !== "voice" && onGenerate && (
        <section aria-label="Generate this sound" className="mt-3 rounded-md border border-aura-border p-3 text-xs">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">Generate this {genKind === "score" ? "music" : genKind === "ambience" ? "ambience" : "sound"}</div>
          <div className="flex gap-2">
            <input aria-label="Sound description" value={genText} onChange={(e) => setGenText(e.target.value)} maxLength={500} className={input} />
            <button onClick={() => onGenerate({ clip_id: clip.id, kind: genKind, description: genText.trim(), duration_seconds: Math.min(300, clip.duration_seconds) })}
              disabled={busy || !canGenerate || !genText.trim()} title={canGenerate ? undefined : "Your role can't generate audio"}
              className="whitespace-nowrap rounded-md border border-aura-gold/60 px-3 text-aura-gold disabled:opacity-40">Generate</button>
          </div>
          {generations.length > 0 && (
            <ul aria-label="Generated for this cue" className="mt-2 space-y-1">
              {generations.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2" data-testid="generation">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${g.status === "succeeded" ? "border-emerald-400/50 text-emerald-300" : g.status === "failed" ? "border-red-400/50 text-red-300" : "border-white/20 text-white/50"}`}>{STATUS[g.status]}</span>
                  <span className="text-white/60">{g.execution === "native" ? "Built-in synthesis" : g.provider}{g.layers.length ? ` · ${g.layers.map((l) => l.name).join(", ")}` : ""}</span>
                  {g.error && <span className="text-red-300">{g.error}</span>}
                  {g.asset_id && <Listen assetId={g.asset_id} />}
                  {g.asset_id && (clip.asset_id === g.asset_id
                    ? <span className="text-emerald-300">In use</span>
                    : <button onClick={() => onSave({ asset_id: g.asset_id!, label: clip.label })} disabled={busy} className="rounded bg-aura-gold px-2 py-0.5 font-medium text-black">Use this</button>)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-white/35">Built-in synthesis is free and placeholder quality — good for timing and testing. It never replaces anything until you choose “Use this”.</p>
        </section>
      )}
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
