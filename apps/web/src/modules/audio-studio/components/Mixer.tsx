"use client";

// Mixer console: one channel strip per track — fader, pan, mute/solo and a live
// peak meter read from the actual playback (silent when stopped).
import { useEffect, useState } from "react";
import type { AudioTrack, UpdateAudioTrackInput } from "@aurastage/contracts";
import { meterDb, type Player } from "../state/mixEngine";

function Meter({ player, trackId }: { player: Player; trackId: string }) {
  const [db, setDb] = useState(-Infinity);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const an = player.playing ? player.analysers.get(trackId) : undefined;
      setDb(an ? meterDb(an) : -Infinity);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player, trackId]);
  const pct = Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
  return (
    <div className="h-24 w-2 overflow-hidden rounded bg-black/60" title={Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : "no signal"} aria-label="Level meter">
      <div className={`w-full ${db > -3 ? "bg-red-500" : db > -12 ? "bg-aura-gold" : "bg-emerald-400"}`} style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }} />
    </div>
  );
}

function Strip({ t, player, busy, onChange }: { t: AudioTrack; player: Player; busy: boolean; onChange: (patch: UpdateAudioTrackInput) => void }) {
  const [gain, setGain] = useState(t.gain_db);
  const [pan, setPan] = useState(t.pan);
  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2 rounded-lg border border-aura-border bg-black/30 p-2" aria-label={`Channel ${t.name}`}>
      <span className="w-full truncate text-center text-[10px] text-white/60" title={t.name}>{t.name}</span>
      <span className="rounded bg-white/10 px-1.5 text-[9px]">{t.family}</span>
      <label className="w-full text-center text-[9px] text-white/40">
        Pan {pan === 0 ? "C" : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}
        <input aria-label={`Pan ${t.name}`} type="range" min={-1} max={1} step={0.05} value={pan} disabled={busy}
          onChange={(e) => setPan(Number(e.target.value))} onPointerUp={() => pan !== t.pan && onChange({ pan })} onKeyUp={() => pan !== t.pan && onChange({ pan })} className="w-full" />
      </label>
      <div className="flex items-end gap-2">
        <input aria-label={`Fader ${t.name}`} type="range" min={-60} max={12} step={0.5} value={gain} disabled={busy}
          onChange={(e) => setGain(Number(e.target.value))} onPointerUp={() => gain !== t.gain_db && onChange({ gain_db: gain })} onKeyUp={() => gain !== t.gain_db && onChange({ gain_db: gain })}
          className="h-24 w-4 [writing-mode:vertical-lr] [direction:rtl]" />
        <Meter player={player} trackId={t.id} />
      </div>
      <span className="text-[10px] tabular-nums text-white/70">{gain > 0 ? "+" : ""}{gain.toFixed(1)} dB</span>
      <div className="flex gap-1">
        <button aria-label={`Mixer mute ${t.name}`} aria-pressed={t.mute} disabled={busy} onClick={() => onChange({ mute: !t.mute })} className={`h-5 w-6 rounded text-[10px] font-bold ${t.mute ? "bg-red-500 text-black" : "border border-aura-border text-white/50"}`}>M</button>
        <button aria-label={`Mixer solo ${t.name}`} aria-pressed={t.solo} disabled={busy} onClick={() => onChange({ solo: !t.solo })} className={`h-5 w-6 rounded text-[10px] font-bold ${t.solo ? "bg-aura-gold text-black" : "border border-aura-border text-white/50"}`}>S</button>
      </div>
    </div>
  );
}

export function Mixer({ tracks, player, busy, onChange }: { tracks: AudioTrack[]; player: Player; busy: boolean; onChange: (id: string, patch: UpdateAudioTrackInput) => void }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Mixer</h3>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {tracks.map((t) => (
          <Strip key={`${t.id}:${t.gain_db}:${t.pan}`} t={t} player={player} busy={busy} onChange={(p) => onChange(t.id, p)} />
        ))}
      </div>
    </div>
  );
}
