"use client";

// Edit an uploaded image or audio file in the browser (assetEditEngine 1.0.0 does the maths). Saving uploads the
// result as a NEW version of the same asset with a note of exactly what was done; the original stays in Versions.

import { useEffect, useMemo, useRef, useState } from "react";
import { assetEdit } from "@aurastage/engines";
import { assetsApi } from "../api/assetsApi";
import type { AssetDetail } from "../types";

type Save = (file: File, note: string) => void;
const baseName = (n: string) => n.replace(/\.[a-z0-9]{2,4}$/i, "");

export function AssetEditor({ d, busy, onSave, onClose }: { d: AssetDetail; busy: boolean; onSave: Save; onClose: () => void }) {
  const a = d.asset;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Edit ${a.name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-aura-border bg-aura-panel p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl">Edit {a.name}</h2>
            <p className="text-xs text-white/50">Saving adds version {d.versions.length + 1}. Version {a.current_version} stays in Versions, untouched.</p>
          </div>
          <button onClick={onClose} aria-label="Close editor" className="text-white/40 hover:text-white">✕</button>
        </div>
        {a.type === "image" ? <ImageEditor d={d} busy={busy} onSave={onSave} /> : <AudioEditor d={d} busy={busy} onSave={onSave} />}
      </div>
    </div>
  );
}

const Slider = ({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) => (
  <label className="block text-xs text-white/60">
    <span className="flex justify-between"><span>{label}</span><span className="text-white/80">{value}{unit}</span></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#c9a45c]" />
  </label>
);

// ---------------------------------------------------------------- image
type ImgEdit = { crop: { x: number; y: number; w: number; h: number }; rotate: 0 | 90 | 180 | 270; flip_h: boolean; flip_v: boolean; brightness: number; contrast: number; saturation: number; max_size: number | null };
const IMG0: ImgEdit = { crop: { x: 0, y: 0, w: 1, h: 1 }, rotate: 0, flip_h: false, flip_v: false, brightness: 100, contrast: 100, saturation: 100, max_size: null };

function ImageEditor({ d, busy, onSave }: { d: AssetDetail; busy: boolean; onSave: Save }) {
  const a = d.asset;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [e, setE] = useState<ImgEdit>(IMG0);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let url = "";
    assetsApi.bytes(a.id, a.current_version).then((b) => {
      url = URL.createObjectURL(new Blob([b], { type: a.media_type ?? "" }));
      const i = new Image();
      i.onload = () => setImg(i);
      i.onerror = () => setError("This image can't be opened in the browser.");
      i.src = url;
    }).catch(() => setError("Couldn't load the image."));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [a.id, a.current_version, a.media_type]);

  const plan = useMemo(() => {
    if (!img) return null;
    try {
      return assetEdit.planImageEdit(img.naturalWidth, img.naturalHeight, e, a.current_version);
    } catch (err) {
      return { error: (err as Error).message.includes("inside") ? "Crop must stay inside the picture." : (err as Error).message } as const;
    }
  }, [img, e, a.current_version]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !plan || "error" in plan) return;
    c.width = plan.width;
    c.height = plan.height;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.filter = plan.filter;
    ctx.translate(plan.width / 2, plan.height / 2);
    ctx.rotate((plan.rotate * Math.PI) / 180);
    ctx.scale(plan.flip_h ? -1 : 1, plan.flip_v ? -1 : 1);
    const w = plan.source.w * plan.scale, h = plan.source.h * plan.scale;
    ctx.drawImage(img, plan.source.x, plan.source.y, plan.source.w, plan.source.h, -w / 2, -h / 2, w, h);
    ctx.restore();
  }, [img, plan]);

  const pct = (v: number) => Math.round(v * 100);
  const setCrop = (k: keyof ImgEdit["crop"], v: number) => setE((p) => ({ ...p, crop: { ...p.crop, [k]: v / 100 } }));
  const aspect = (r: number | null) => {
    if (!img) return;
    if (r === null) return setE((p) => ({ ...p, crop: IMG0.crop }));
    const src = img.naturalWidth / img.naturalHeight;
    const crop = src > r ? { w: r / src, h: 1 } : { w: 1, h: src / r };
    setE((p) => ({ ...p, crop: { x: (1 - crop.w) / 2, y: (1 - crop.h) / 2, ...crop } }));
  };
  const changed = JSON.stringify(e) !== JSON.stringify(IMG0);
  const save = () => {
    if (!canvas.current || !plan || "error" in plan) return;
    const type = a.media_type === "image/jpeg" ? "image/jpeg" : "image/png";
    canvas.current.toBlob((blob) => {
      if (!blob) return setError("Couldn't produce the edited image.");
      onSave(new File([blob], `${baseName(a.name)}.${type === "image/jpeg" ? "jpg" : "png"}`, { type }), plan.note);
    }, type, 0.92);
  };

  if (error) return <p role="alert" className="text-sm text-red-300">{error}</p>;
  if (!img) return <p className="text-sm text-white/50">Loading the image…</p>;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <div className="flex items-center justify-center rounded-md bg-black p-2">
        {plan && "error" in plan ? <p className="p-8 text-sm text-red-300">{plan.error}</p>
          : <canvas ref={canvas} aria-label="Edited preview" className="max-h-[60vh] max-w-full object-contain" />}
      </div>
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setE((p) => ({ ...p, rotate: (((p.rotate + 270) % 360) as ImgEdit["rotate"]) }))} className="rounded border border-aura-border px-2 py-1">⟲ Rotate left</button>
          <button onClick={() => setE((p) => ({ ...p, rotate: (((p.rotate + 90) % 360) as ImgEdit["rotate"]) }))} className="rounded border border-aura-border px-2 py-1">⟳ Rotate right</button>
          <button aria-pressed={e.flip_h} onClick={() => setE((p) => ({ ...p, flip_h: !p.flip_h }))} className="rounded border border-aura-border px-2 py-1">Flip ↔</button>
          <button aria-pressed={e.flip_v} onClick={() => setE((p) => ({ ...p, flip_v: !p.flip_v }))} className="rounded border border-aura-border px-2 py-1">Flip ↕</button>
        </div>
        <fieldset className="space-y-1 rounded border border-aura-border p-2">
          <legend className="px-1 text-white/50">Crop</legend>
          <div className="flex flex-wrap gap-1">
            {([["Full", null], ["16:9", 16 / 9], ["2.39:1", 2.39], ["1:1", 1], ["9:16", 9 / 16], ["4:5", 0.8]] as [string, number | null][]).map(([l, r]) => (
              <button key={l} onClick={() => aspect(r)} className="rounded border border-aura-border px-2 py-0.5">{l}</button>
            ))}
          </div>
          <Slider label="Crop left" value={pct(e.crop.x)} min={0} max={99} unit="%" onChange={(v) => setCrop("x", v)} />
          <Slider label="Crop top" value={pct(e.crop.y)} min={0} max={99} unit="%" onChange={(v) => setCrop("y", v)} />
          <Slider label="Crop width" value={pct(e.crop.w)} min={1} max={100} unit="%" onChange={(v) => setCrop("w", v)} />
          <Slider label="Crop height" value={pct(e.crop.h)} min={1} max={100} unit="%" onChange={(v) => setCrop("h", v)} />
        </fieldset>
        <Slider label="Brightness" value={e.brightness} min={0} max={200} unit="%" onChange={(v) => setE({ ...e, brightness: v })} />
        <Slider label="Contrast" value={e.contrast} min={0} max={200} unit="%" onChange={(v) => setE({ ...e, contrast: v })} />
        <Slider label="Saturation" value={e.saturation} min={0} max={200} unit="%" onChange={(v) => setE({ ...e, saturation: v })} />
        <label className="block text-white/60">Size
          <select aria-label="Size" value={e.max_size ?? ""} onChange={(ev) => setE({ ...e, max_size: ev.target.value ? Number(ev.target.value) : null })}
            className="mt-1 w-full rounded border border-aura-border bg-black px-2 py-1">
            <option value="">Keep ({img.naturalWidth}×{img.naturalHeight})</option>
            {[3840, 2048, 1920, 1280, 1024, 512].map((s) => <option key={s} value={s}>Fit in {s} px</option>)}
          </select>
        </label>
        {plan && !("error" in plan) && <p className="text-white/50" data-testid="edit-result">Result: {plan.width}×{plan.height}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={!changed || busy || !plan || "error" in plan} className="rounded-md bg-aura-gold px-3 py-1.5 font-medium text-black disabled:opacity-40">Save as new version</button>
          <button onClick={() => setE(IMG0)} disabled={!changed} className="rounded-md border border-aura-border px-3 py-1.5 disabled:opacity-40">Reset</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- audio
type AudEdit = { trim_start: number; trim_end: number | null; gain_db: number; fade_in: number; fade_out: number; normalize_peak_db: number | null };
const AUD0: AudEdit = { trim_start: 0, trim_end: null, gain_db: 0, fade_in: 0, fade_out: 0, normalize_peak_db: null };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The sample rate written in a WAV header (null for other formats). */
function sourceSampleRate(b: ArrayBuffer) {
  const v = new DataView(b);
  if (b.byteLength < 28 || v.getUint32(0) !== 0x52494646 || v.getUint32(8) !== 0x57415645) return null;
  const sr = v.getUint32(24, true);
  return sr >= 8000 && sr <= 192000 ? sr : null;
}

function AudioEditor({ d, busy, onSave }: { d: AssetDetail; busy: boolean; onSave: Save }) {
  const a = d.asset;
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [e, setE] = useState<AudEdit>(AUD0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const wave = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let ac: AudioContext | null = null;
    assetsApi.bytes(a.id, a.current_version).then((b) => {
      // Decode at the file's own sample rate: browsers otherwise resample to the sound card's rate (e.g. 48 → 44.1 kHz).
      ac = new AudioContext({ sampleRate: sourceSampleRate(b) ?? a.specs.sample_rate ?? 48000 });
      ctxRef.current = ac;
      return ac.decodeAudioData(b);
    }).then(setBuf).catch(() => setError("This audio file can't be decoded in the browser."));
    return () => { srcRef.current?.stop(); ac?.close(); };
  }, [a.id, a.current_version, a.specs.sample_rate]);

  const dur = buf?.duration ?? 0;
  const result = useMemo(() => {
    if (!buf) return null;
    try {
      return assetEdit.applyAudioEdit({ sample_rate: buf.sampleRate, channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)) }, e, a.current_version);
    } catch (err) {
      return { error: (err as Error).message } as const;
    }
  }, [buf, e, a.current_version]);

  useEffect(() => {
    const c = wave.current;
    if (!c || !buf) return;
    const w = (c.width = 600), h = (c.height = 90), ctx = c.getContext("2d")!, data = buf.getChannelData(0), step = Math.max(1, Math.floor(data.length / w));
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c9a45c";
    for (let x = 0; x < w; x++) {
      let p = 0;
      for (let i = x * step; i < Math.min(data.length, (x + 1) * step); i++) p = Math.max(p, Math.abs(data[i]));
      ctx.fillRect(x, h / 2 - (p * h) / 2, 1, Math.max(1, p * h));
    }
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    const sx = (e.trim_start / dur) * w, ex = ((e.trim_end ?? dur) / dur) * w;
    ctx.fillRect(0, 0, sx, h); ctx.fillRect(ex, 0, w - ex, h);
  }, [buf, e.trim_start, e.trim_end, dur]);

  const toBuffer = () => {
    if (!result || "error" in result || !ctxRef.current) return null;
    const b = ctxRef.current.createBuffer(result.channels.length, result.channels[0].length, result.sample_rate);
    result.channels.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return b;
  };
  const play = () => {
    if (playing) { srcRef.current?.stop(); return; }
    const b = toBuffer();
    if (!b || !ctxRef.current) return;
    const s = ctxRef.current.createBufferSource();
    s.buffer = b; s.connect(ctxRef.current.destination);
    s.onended = () => setPlaying(false);
    srcRef.current = s; s.start(); setPlaying(true);
  };
  const changed = JSON.stringify(e) !== JSON.stringify(AUD0);
  const save = () => {
    if (!result || "error" in result) return;
    const bytes = assetEdit.encodeWav16(result.sample_rate, result.channels);
    onSave(new File([bytes.buffer as ArrayBuffer], `${baseName(a.name)}.wav`, { type: "audio/wav" }), result.note);
  };

  if (error) return <p role="alert" className="text-sm text-red-300">{error}</p>;
  if (!buf) return <p className="text-sm text-white/50">Loading the audio…</p>;
  const end = e.trim_end ?? dur;
  return (
    <div className="space-y-3 text-xs">
      <canvas ref={wave} aria-label="Waveform" className="h-24 w-full rounded bg-black" />
      <div className="grid gap-3 md:grid-cols-2">
        <Slider label="Start" value={r2(e.trim_start)} min={0} max={r2(dur)} step={0.01} unit=" s" onChange={(v) => setE({ ...e, trim_start: Math.min(v, end - 0.01) })} />
        <Slider label="End" value={r2(end)} min={0} max={r2(dur)} step={0.01} unit=" s" onChange={(v) => setE({ ...e, trim_end: v >= r2(dur) ? null : Math.max(v, e.trim_start + 0.01) })} />
        <Slider label="Gain" value={e.gain_db} min={-24} max={24} step={0.5} unit=" dB" onChange={(v) => setE({ ...e, gain_db: v })} />
        <Slider label="Fade in" value={e.fade_in} min={0} max={Math.min(10, r2(end - e.trim_start))} step={0.05} unit=" s" onChange={(v) => setE({ ...e, fade_in: v })} />
        <Slider label="Fade out" value={e.fade_out} min={0} max={Math.min(10, r2(end - e.trim_start))} step={0.05} unit=" s" onChange={(v) => setE({ ...e, fade_out: v })} />
        <label className="flex items-center gap-2 text-white/70">
          <input type="checkbox" checked={e.normalize_peak_db !== null} onChange={(ev) => setE({ ...e, normalize_peak_db: ev.target.checked ? -1 : null })} />
          Normalise peak to −1 dBFS
        </label>
      </div>
      {result && ("error" in result ? <p className="text-red-300">{result.error}</p> : (
        <p className="text-white/60" data-testid="edit-result">
          Result: {r2(result.duration)} s · peak {Number.isFinite(result.peak_db_after) ? `${result.peak_db_after} dBFS` : "silent"}
          {result.clipped_samples > 0 && <span className="text-amber-300"> · {result.clipped_samples} samples would clip — lower the gain</span>}
        </p>
      ))}
      <div className="flex gap-2">
        <button onClick={play} disabled={!result || "error" in result} className="rounded-md border border-aura-border px-3 py-1.5">{playing ? "Stop" : "▶ Preview"}</button>
        <button onClick={save} disabled={!changed || busy || !result || "error" in result} className="rounded-md bg-aura-gold px-3 py-1.5 font-medium text-black disabled:opacity-40">Save as new version</button>
        <button onClick={() => setE(AUD0)} disabled={!changed} className="rounded-md border border-aura-border px-3 py-1.5 disabled:opacity-40">Reset</button>
      </div>
      <p className="text-white/40">Saved as a 16-bit WAV at {buf.sampleRate} Hz, {buf.numberOfChannels === 1 ? "mono" : `${buf.numberOfChannels} channels`}. If the recording is in an approved mix, the mix is flagged for a new measurement.</p>
    </div>
  );
}
