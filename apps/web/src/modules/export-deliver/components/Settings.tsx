"use client";

// Export settings for the chosen preset. The technical spec is fixed by the
// versioned profile; only the options the profile supports can be changed.
import { useState } from "react";
import type { DeliveryProfile } from "../types";

export function Settings({ profile, lockLabel, canRender, busy, onRender }: {
  profile: DeliveryProfile; lockLabel: string | null; canRender: boolean; busy: boolean;
  onRender: (options: { watermark: string | null; burn_timecode: boolean }) => void;
}) {
  const [watermark, setWatermark] = useState("");
  const [tc, setTc] = useState(true);
  const rows: [string, string][] = [];
  if (profile.container) rows.push(["Format", profile.container.toUpperCase()]);
  if (profile.video) {
    rows.push(["Video", `${profile.video.codec === "prores" ? "Apple ProRes" : "H.264"} · ${profile.video.quality}`]);
    rows.push(["Resolution", `${profile.video.width}×${profile.video.height}`], ["Frame rate", "24 fps"], ["Colour", profile.video.color], ["Pixel format", profile.video.pix_fmt]);
  }
  if (profile.audio) rows.push(["Audio", `${profile.audio.codec === "aac" ? `AAC ${profile.audio.bitrate}` : "PCM 24-bit"} · 48 kHz · stereo`]);
  if (profile.loudness) rows.push(["Loudness", `${profile.loudness.integrated_lufs} LUFS ±${profile.loudness.tolerance_lu}, true peak ≤ ${profile.loudness.max_true_peak_dbtp} dBTP (checked, never re-levelled)`]);
  rows.push(["Files", profile.files.join(", ") || "—"], ["Profile version", profile.version]);
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4" aria-label="Export settings">
      <h3 className="font-display text-lg">{profile.label}</h3>
      <p className="mt-1 text-xs text-white/50">{profile.available ? profile.description : profile.unavailable_reason}</p>
      {profile.available && (
        <>
          <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-white/40">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {(profile.supports.watermark || profile.supports.burn_timecode) && (
            <div className="mt-3 space-y-2 border-t border-aura-border pt-3 text-xs">
              {profile.supports.watermark && (
                <label className="block">
                  <span className="text-white/60">Watermark (optional)</span>
                  <input aria-label="Watermark" maxLength={60} value={watermark} onChange={(e) => setWatermark(e.target.value)} placeholder="e.g. FOR REVIEW ONLY" className="mt-1 w-full rounded border border-aura-border bg-black/40 px-2 py-1" />
                </label>
              )}
              {profile.supports.burn_timecode && (
                <label className="flex items-center gap-2 text-white/70">
                  <input type="checkbox" checked={tc} onChange={(e) => setTc(e.target.checked)} /> Burn in timecode
                </label>
              )}
            </div>
          )}
          <button
            onClick={() => onRender({ watermark: profile.supports.watermark && watermark.trim() ? watermark.trim() : null, burn_timecode: profile.supports.burn_timecode && tc })}
            disabled={!canRender || busy}
            className="mt-4 w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            {busy ? "Queuing…" : `Render ${profile.label}`}
          </button>
          <p className="mt-1 text-center text-[11px] text-white/40">{lockLabel ? `From ${lockLabel}` : "Lock the picture in Editorial first."}</p>
        </>
      )}
    </div>
  );
}
