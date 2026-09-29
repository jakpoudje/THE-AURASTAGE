"use client";

// Mixer console (owner, 2026-09-29: "mixing needs more tools, like an advanced studio"). One channel strip per track —
// fader, pan, mute/solo, live meter and gain reduction — and, for the selected channel, a full strip: high-pass filter,
// 3-band EQ with its frequency curve, compressor, reverb/delay sends and volume automation (with "duck under dialogue").
// Below: department buses (DX/FX/BG/MX), the shared reverb and delay, and the master with limiter and "match loudness
// target". Everything is saved with the session and drives playback, measurement and export through one graph.
import { useEffect, useMemo, useState } from "react";
import { FAMILY_BUS, type AudioClip, type AudioTrack, type SessionMix, type TrackFx, type UpdateAudioTrackInput } from "@aurastage/contracts";
import { duckUnderDialogue, loudnessCorrection } from "@aurastage/engines";
import { meterDb, SAMPLE_RATE, type Player } from "../state/mixEngine";
import type { AudioMeasurement } from "../types";

const BUSES = ["DX", "FX", "BG", "MX"] as const;
const BUS_LABEL: Record<(typeof BUSES)[number], string> = { DX: "Dialogue", FX: "Effects & Foley", BG: "Ambience", MX: "Music" };

function useTick(player: Player) {
  const [, set] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => { set((x) => (x + 1) % 1e6); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player]);
}

function Meter({ db, label = "Level meter" }: { db: number; label?: string }) {
  const pct = Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
  return (
    <div className="h-24 w-2 overflow-hidden rounded bg-black/60" title={Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : "no signal"} aria-label={label}>
      <div className={`w-full ${db > -3 ? "bg-red-500" : db > -12 ? "bg-aura-gold" : "bg-emerald-400"}`} style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }} />
    </div>
  );
}

function Strip({ t, player, busy, selected, onSelect, onChange }: { t: AudioTrack; player: Player; busy: boolean; selected: boolean; onSelect: () => void; onChange: (patch: UpdateAudioTrackInput) => void }) {
  useTick(player);
  const [gain, setGain] = useState(t.gain_db);
  const [pan, setPan] = useState(t.pan);
  const an = player.playing ? player.analysers.get(t.id) : undefined;
  const comp = player.playing ? player.meters.comps.get(t.id) : undefined;
  const fx = t.fx;
  const badges = [fx.hpf_hz > 0 && "HPF", (fx.eq.low.gain_db || fx.eq.mid.gain_db || fx.eq.high.gain_db) && "EQ", fx.comp.on && "COMP",
    fx.reverb_send_db > -60 && "REV", fx.delay_send_db > -60 && "DLY", fx.automation.length > 0 && "AUTO"].filter(Boolean) as string[];
  return (
    <div className={`flex w-24 shrink-0 flex-col items-center gap-2 rounded-lg border bg-black/30 p-2 ${selected ? "border-aura-gold" : "border-aura-border"}`} aria-label={`Channel ${t.name}`}>
      <span className="w-full truncate text-center text-[10px] text-white/60" title={t.name}>{t.name}</span>
      <span className="rounded bg-white/10 px-1.5 text-[9px]">{t.family} → {FAMILY_BUS[t.family]}</span>
      <button onClick={onSelect} aria-label={`Channel strip ${t.name}`} className={`w-full rounded border px-1 py-0.5 text-[9px] ${selected ? "border-aura-gold text-aura-gold" : "border-aura-border text-white/60"}`}>
        {badges.length ? badges.join(" · ") : "EQ · Dyn · Sends"}
      </button>
      <label className="w-full text-center text-[9px] text-white/40">
        Pan {pan === 0 ? "C" : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}
        <input aria-label={`Pan ${t.name}`} type="range" min={-1} max={1} step={0.05} value={pan} disabled={busy}
          onChange={(e) => setPan(Number(e.target.value))} onPointerUp={() => pan !== t.pan && onChange({ pan })} onKeyUp={() => pan !== t.pan && onChange({ pan })} className="w-full" />
      </label>
      <div className="flex items-end gap-2">
        <input aria-label={`Fader ${t.name}`} type="range" min={-60} max={12} step={0.5} value={gain} disabled={busy}
          onChange={(e) => setGain(Number(e.target.value))} onPointerUp={() => gain !== t.gain_db && onChange({ gain_db: gain })} onKeyUp={() => gain !== t.gain_db && onChange({ gain_db: gain })}
          className="h-24 w-4 [writing-mode:vertical-lr] [direction:rtl]" />
        <Meter db={an ? meterDb(an) : -Infinity} />
      </div>
      <span className="text-[10px] tabular-nums text-white/70">{gain > 0 ? "+" : ""}{gain.toFixed(1)} dB</span>
      {fx.comp.on && <span className="text-[9px] tabular-nums text-sky-300" title="Compressor gain reduction">GR {comp ? comp.reduction.toFixed(1) : "0.0"} dB</span>}
      <div className="flex gap-1">
        <button aria-label={`Mixer mute ${t.name}`} aria-pressed={t.mute} disabled={busy} onClick={() => onChange({ mute: !t.mute })} className={`h-5 w-6 rounded text-[10px] font-bold ${t.mute ? "bg-red-500 text-black" : "border border-aura-border text-white/50"}`}>M</button>
        <button aria-label={`Mixer solo ${t.name}`} aria-pressed={t.solo} disabled={busy} onClick={() => onChange({ solo: !t.solo })} className={`h-5 w-6 rounded text-[10px] font-bold ${t.solo ? "bg-aura-gold text-black" : "border border-aura-border text-white/50"}`}>S</button>
      </div>
    </div>
  );
}

function Num({ label, value, min, max, step, unit, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block text-[10px] text-white/50">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-white/80">{value > 0 && unit === "dB" ? "+" : ""}{value}{unit ? ` ${unit}` : ""}</span></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

/** The EQ's real frequency response (the same Web Audio filters used for playback and export). */
function EqCurve({ fx }: { fx: TrackFx }) {
  const path = useMemo(() => {
    if (typeof OfflineAudioContext === "undefined") return "";
    const c = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const freqs = new Float32Array(120).map((_, i) => 20 * Math.pow(1000, i / 119)); // 20 Hz – 20 kHz
    const total = new Float32Array(freqs.length).fill(0);
    const add = (type: BiquadFilterType, f: number, g: number, q?: number) => {
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = g; if (q) b.Q.value = q;
      const mag = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
      b.getFrequencyResponse(freqs, mag, ph);
      mag.forEach((m, i) => (total[i] += 20 * Math.log10(Math.max(1e-6, m))));
    };
    if (fx.hpf_hz > 0) add("highpass", fx.hpf_hz, 0, 0.707);
    add("lowshelf", fx.eq.low.freq, fx.eq.low.gain_db);
    add("peaking", fx.eq.mid.freq, fx.eq.mid.gain_db, fx.eq.mid.q);
    add("highshelf", fx.eq.high.freq, fx.eq.high.gain_db);
    return [...total].map((db, i) => `${i === 0 ? "M" : "L"} ${(i / 119) * 300} ${50 - Math.max(-24, Math.min(24, db)) * 2}`).join(" ");
  }, [fx]);
  return (
    <svg viewBox="0 0 300 100" className="h-24 w-full rounded bg-black/50" aria-label="EQ curve" role="img">
      {[100, 1000, 10000].map((f) => { const x = (Math.log10(f / 20) / 3) * 300; return <g key={f}><line x1={x} x2={x} y1={0} y2={100} stroke="#333" /><text x={x + 2} y={96} fontSize="8" fill="#777">{f >= 1000 ? `${f / 1000}k` : f}</text></g>; })}
      <line x1={0} x2={300} y1={50} y2={50} stroke="#444" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="#e8b84b" strokeWidth="2" />
    </svg>
  );
}

function AutomationGraph({ points, seconds }: { points: TrackFx["automation"]; seconds: number }) {
  const x = (t: number) => (t / Math.max(1, seconds)) * 300, y = (db: number) => 50 - (db / 30) * 45;
  const d = points.length ? [`M 0 ${y(points[0].db)}`, ...points.map((p) => `L ${x(p.t)} ${y(p.db)}`), `L 300 ${y(points[points.length - 1].db)}`].join(" ") : "M 0 50 L 300 50";
  return (
    <svg viewBox="0 0 300 100" className="h-20 w-full rounded bg-black/50" aria-label="Volume automation" role="img">
      <line x1={0} x2={300} y1={50} y2={50} stroke="#444" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.db)} r="2.5" fill="#38bdf8" />)}
    </svg>
  );
}

function ChannelEditor({ t, clips, tracks, seconds, busy, onSave, position }: {
  t: AudioTrack; clips: AudioClip[]; tracks: AudioTrack[]; seconds: number; busy: boolean; position: number; onSave: (fx: TrackFx, msg: string) => void;
}) {
  const [fx, setFx] = useState<TrackFx>(t.fx);
  const [pt, setPt] = useState<{ t: number; db: number }>({ t: Math.round(position * 10) / 10, db: -6 });
  useEffect(() => setFx(t.fx), [t.id, t.fx]);
  const dirty = JSON.stringify(fx) !== JSON.stringify(t.fx);
  const set = (patch: Partial<TrackFx>) => setFx({ ...fx, ...patch });
  const dialogue = clips.filter((c) => c.kind === "asset" && c.asset_id && tracks.some((x) => x.id === c.track_id && FAMILY_BUS[x.family] === "DX"))
    .map((c) => ({ start: c.start_seconds, end: c.start_seconds + c.duration_seconds }));
  const duck = duckUnderDialogue({ dialogue, scene_seconds: seconds });
  const isDialogue = FAMILY_BUS[t.family] === "DX";
  return (
    <section aria-label={`Channel strip editor ${t.name}`} className="mt-3 rounded-lg border border-aura-gold/40 bg-black/30 p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="font-medium">{t.name} — channel strip</h4>
        <span className="text-white/40">{t.family} → {BUS_LABEL[FAMILY_BUS[t.family]]} bus</span>
        <div className="ml-auto flex gap-2">
          {dirty && <button onClick={() => setFx(t.fx)} className="rounded border border-aura-border px-2 py-1">Discard</button>}
          <button onClick={() => onSave(fx, `Saved ${t.name}'s channel strip — measure the mix again before approving.`)} disabled={!dirty || busy} className="rounded bg-aura-gold px-3 py-1 font-medium text-black disabled:opacity-40">Save channel</button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-2 lg:col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Filter & EQ</div>
          <EqCurve fx={fx} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Num label="High-pass (0 = off)" value={fx.hpf_hz} min={0} max={500} step={10} unit="Hz" onChange={(v) => set({ hpf_hz: v })} />
            <Num label="Low shelf gain" value={fx.eq.low.gain_db} min={-15} max={15} step={0.5} unit="dB" onChange={(v) => set({ eq: { ...fx.eq, low: { ...fx.eq.low, gain_db: v } } })} />
            <Num label="Low shelf frequency" value={fx.eq.low.freq} min={40} max={500} step={10} unit="Hz" onChange={(v) => set({ eq: { ...fx.eq, low: { ...fx.eq.low, freq: v } } })} />
            <Num label="Mid gain" value={fx.eq.mid.gain_db} min={-15} max={15} step={0.5} unit="dB" onChange={(v) => set({ eq: { ...fx.eq, mid: { ...fx.eq.mid, gain_db: v } } })} />
            <Num label="Mid frequency" value={fx.eq.mid.freq} min={150} max={8000} step={50} unit="Hz" onChange={(v) => set({ eq: { ...fx.eq, mid: { ...fx.eq.mid, freq: v } } })} />
            <Num label="Mid width (Q)" value={fx.eq.mid.q} min={0.3} max={8} step={0.1} unit="" onChange={(v) => set({ eq: { ...fx.eq, mid: { ...fx.eq.mid, q: v } } })} />
            <Num label="High shelf gain" value={fx.eq.high.gain_db} min={-15} max={15} step={0.5} unit="dB" onChange={(v) => set({ eq: { ...fx.eq, high: { ...fx.eq.high, gain_db: v } } })} />
            <Num label="High shelf frequency" value={fx.eq.high.freq} min={1500} max={16000} step={100} unit="Hz" onChange={(v) => set({ eq: { ...fx.eq, high: { ...fx.eq.high, freq: v } } })} />
          </div>
          {isDialogue && <button onClick={() => set({ hpf_hz: 80, eq: { ...fx.eq, mid: { freq: 3000, gain_db: 2, q: 1 } } })} className="rounded border border-aura-border px-2 py-1 text-white/70">Dialogue clean-up preset (HPF 80 Hz, +2 dB presence)</button>}
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Compressor</div>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Compressor on" checked={fx.comp.on} onChange={(e) => set({ comp: { ...fx.comp, on: e.target.checked } })} /> On</label>
          <Num label="Threshold" value={fx.comp.threshold_db} min={-60} max={0} step={1} unit="dB" disabled={!fx.comp.on} onChange={(v) => set({ comp: { ...fx.comp, threshold_db: v } })} />
          <Num label="Ratio" value={fx.comp.ratio} min={1} max={20} step={0.5} unit=":1" disabled={!fx.comp.on} onChange={(v) => set({ comp: { ...fx.comp, ratio: v } })} />
          <Num label="Attack" value={fx.comp.attack_ms} min={0.5} max={200} step={0.5} unit="ms" disabled={!fx.comp.on} onChange={(v) => set({ comp: { ...fx.comp, attack_ms: v } })} />
          <Num label="Release" value={fx.comp.release_ms} min={10} max={1000} step={10} unit="ms" disabled={!fx.comp.on} onChange={(v) => set({ comp: { ...fx.comp, release_ms: v } })} />
          <Num label="Makeup gain" value={fx.comp.makeup_db} min={0} max={24} step={0.5} unit="dB" disabled={!fx.comp.on} onChange={(v) => set({ comp: { ...fx.comp, makeup_db: v } })} />
          <div className="pt-2 text-[10px] uppercase tracking-wider text-white/50">Sends (post-fader)</div>
          <Num label="Reverb send (-60 = off)" value={fx.reverb_send_db} min={-60} max={6} step={1} unit="dB" onChange={(v) => set({ reverb_send_db: v })} />
          <Num label="Delay send (-60 = off)" value={fx.delay_send_db} min={-60} max={6} step={1} unit="dB" onChange={(v) => set({ delay_send_db: v })} />
        </div>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Volume automation</div>
          <AutomationGraph points={fx.automation} seconds={seconds} />
          <p className="text-white/40">{fx.automation.length ? `${fx.automation.length} points, on top of the fader.` : "None — the fader sets the level for the whole scene."}</p>
          {!isDialogue && (
            <button onClick={() => set({ automation: duck.automation })} disabled={!duck.automation.length}
              title={duck.automation.length ? duck.summary : "Place dialogue recordings first"} className="w-full rounded border border-sky-400/60 px-2 py-1 text-sky-300 disabled:opacity-40">
              Duck under dialogue
            </button>
          )}
          {!isDialogue && <p className="text-[10px] text-white/40">{duck.summary}</p>}
          <div className="flex items-end gap-1">
            <label className="text-[10px] text-white/50">At (s)<input aria-label="Automation time" type="number" min={0} max={seconds} step={0.1} value={pt.t} onChange={(e) => setPt({ ...pt, t: Number(e.target.value) })} className="block w-16 rounded border border-aura-border bg-black px-1" /></label>
            <label className="text-[10px] text-white/50">dB<input aria-label="Automation level" type="number" min={-60} max={12} step={0.5} value={pt.db} onChange={(e) => setPt({ ...pt, db: Number(e.target.value) })} className="block w-14 rounded border border-aura-border bg-black px-1" /></label>
            <button onClick={() => set({ automation: [...fx.automation.filter((p) => p.t !== pt.t), pt].sort((a, b) => a.t - b.t).slice(0, 400) })} className="rounded border border-aura-border px-2 py-0.5">Add point</button>
            {fx.automation.length > 0 && <button onClick={() => set({ automation: [] })} className="rounded border border-aura-border px-2 py-0.5 text-white/60">Clear</button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function RoutingPanel({ mix, measurement, target, busy, player, onSave }: {
  mix: SessionMix; measurement: AudioMeasurement | null; target: { integrated_lufs: number; max_true_peak_dbtp: number }; busy: boolean; player: Player;
  onSave: (mix: SessionMix, msg: string) => void;
}) {
  useTick(player);
  const [m, setM] = useState<SessionMix>(mix);
  useEffect(() => setM(mix), [mix]);
  const dirty = JSON.stringify(m) !== JSON.stringify(mix);
  const fix = measurement?.integrated_lufs != null && measurement.true_peak_dbtp != null
    ? loudnessCorrection({ measured_lufs: measurement.integrated_lufs, true_peak_dbtp: measurement.true_peak_dbtp, target_lufs: target.integrated_lufs, max_true_peak_dbtp: target.max_true_peak_dbtp, current_master_db: mix.master.gain_db, limiter: mix.master.limiter, ceiling_db: mix.master.ceiling_db })
    : null;
  const lim = player.playing ? player.meters.limiter : undefined, masterAn = player.playing ? player.meters.master : undefined;
  return (
    <section aria-label="Buses and master" className="mt-3 rounded-lg border border-aura-border bg-black/20 p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="font-medium">Buses, effects & master</h4>
        <div className="ml-auto flex gap-2">
          {dirty && <button onClick={() => setM(mix)} className="rounded border border-aura-border px-2 py-1">Discard</button>}
          <button onClick={() => onSave(m, "Mix routing saved — measure the mix again before approving.")} disabled={!dirty || busy} className="rounded bg-aura-gold px-3 py-1 font-medium text-black disabled:opacity-40">Save routing</button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Department buses</div>
          {BUSES.map((b) => (
            <div key={b} className="flex items-end gap-2">
              <div className="flex-1"><Num label={`${BUS_LABEL[b]} bus`} value={m.buses[b].gain_db} min={-60} max={12} step={0.5} unit="dB" onChange={(v) => setM({ ...m, buses: { ...m.buses, [b]: { ...m.buses[b], gain_db: v } } })} /></div>
              <button aria-label={`Bus mute ${b}`} aria-pressed={m.buses[b].mute} onClick={() => setM({ ...m, buses: { ...m.buses, [b]: { ...m.buses[b], mute: !m.buses[b].mute } } })}
                className={`h-5 w-6 rounded text-[10px] font-bold ${m.buses[b].mute ? "bg-red-500 text-black" : "border border-aura-border text-white/50"}`}>M</button>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Reverb (shared)</div>
          <label className="block text-[10px] text-white/50">Space
            <select aria-label="Reverb type" value={m.reverb.type} onChange={(e) => setM({ ...m, reverb: { ...m.reverb, type: e.target.value as SessionMix["reverb"]["type"] } })} className="block w-full rounded border border-aura-border bg-black px-1 py-0.5 text-white">
              <option value="room">Room</option><option value="hall">Hall</option><option value="plate">Plate</option>
            </select>
          </label>
          <Num label="Decay" value={m.reverb.decay_s} min={0.2} max={8} step={0.1} unit="s" onChange={(v) => setM({ ...m, reverb: { ...m.reverb, decay_s: v } })} />
          <Num label="Pre-delay" value={m.reverb.pre_delay_ms} min={0} max={200} step={5} unit="ms" onChange={(v) => setM({ ...m, reverb: { ...m.reverb, pre_delay_ms: v } })} />
          <Num label="Reverb return" value={m.reverb.return_db} min={-60} max={6} step={0.5} unit="dB" onChange={(v) => setM({ ...m, reverb: { ...m.reverb, return_db: v } })} />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Delay (shared)</div>
          <Num label="Delay time" value={m.delay.time_ms} min={20} max={2000} step={10} unit="ms" onChange={(v) => setM({ ...m, delay: { ...m.delay, time_ms: v } })} />
          <Num label="Feedback" value={m.delay.feedback} min={0} max={0.9} step={0.05} unit="" onChange={(v) => setM({ ...m, delay: { ...m.delay, feedback: v } })} />
          <Num label="Delay return" value={m.delay.return_db} min={-60} max={6} step={0.5} unit="dB" onChange={(v) => setM({ ...m, delay: { ...m.delay, return_db: v } })} />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Master</div>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Num label="Master gain" value={m.master.gain_db} min={-24} max={24} step={0.1} unit="dB" onChange={(v) => setM({ ...m, master: { ...m.master, gain_db: Math.round(v * 10) / 10 } })} />
              <label className="flex items-center gap-2 text-[10px] text-white/60"><input type="checkbox" aria-label="Master limiter" checked={m.master.limiter} onChange={(e) => setM({ ...m, master: { ...m.master, limiter: e.target.checked } })} /> Limiter</label>
              <Num label="Ceiling" value={m.master.ceiling_db} min={-12} max={0} step={0.1} unit="dB" disabled={!m.master.limiter} onChange={(v) => setM({ ...m, master: { ...m.master, ceiling_db: Math.round(v * 10) / 10 } })} />
              {m.master.limiter && <span className="text-[9px] tabular-nums text-sky-300">Limiting {lim ? lim.reduction.toFixed(1) : "0.0"} dB</span>}
            </div>
            <Meter db={masterAn ? meterDb(masterAn) : -Infinity} label="Master meter" />
          </div>
          {fix ? (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] text-white/60" data-testid="loudness-fix">{fix.note}</p>
              <button onClick={() => onSave({ ...mix, master: { ...mix.master, gain_db: fix.master_gain_db } }, `Master set to ${fix.master_gain_db > 0 ? "+" : ""}${fix.master_gain_db} dB for ${target.integrated_lufs} LUFS — measure again to confirm.`)}
                disabled={busy || Math.abs(fix.change_db) < 0.1 || dirty} title={dirty ? "Save or discard your routing changes first" : undefined}
                className="w-full rounded border border-emerald-400/60 px-2 py-1 text-emerald-300 disabled:opacity-40">Match loudness target ({target.integrated_lufs} LUFS)</button>
            </div>
          ) : <p className="pt-1 text-[10px] text-white/40">Measure the mix to get a loudness correction.</p>}
        </div>
      </div>
    </section>
  );
}

export function Mixer({ tracks, clips, player, busy, seconds, position, mix, measurement, target, onChange, onMix }: {
  tracks: AudioTrack[]; clips: AudioClip[]; player: Player; busy: boolean; seconds: number; position: number;
  mix: SessionMix; measurement: AudioMeasurement | null; target: { integrated_lufs: number; max_true_peak_dbtp: number };
  onChange: (id: string, patch: UpdateAudioTrackInput, msg?: string | null) => void; onMix: (mix: SessionMix, msg: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const selected = tracks.find((t) => t.id === sel) ?? null;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Mixer</h3>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {tracks.map((t) => (
          <Strip key={`${t.id}:${t.gain_db}:${t.pan}`} t={t} player={player} busy={busy} selected={t.id === sel} onSelect={() => setSel(t.id === sel ? null : t.id)} onChange={(p) => onChange(t.id, p)} />
        ))}
      </div>
      {selected && <ChannelEditor t={selected} clips={clips} tracks={tracks} seconds={seconds} busy={busy} position={position} onSave={(fx, msg) => onChange(selected.id, { fx }, msg)} />}
      <RoutingPanel mix={mix} measurement={measurement} target={target} busy={busy} player={player} onSave={onMix} />
    </div>
  );
}
