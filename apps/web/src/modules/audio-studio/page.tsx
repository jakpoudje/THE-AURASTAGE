"use client";

// apps/web/src/modules/audio-studio/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Audio Studio workspace (docs/design/UI_REFERENCE.md §9).
// Canonical backend authority: apps/api/src/modules/audio (+ assets for recordings)
// Engines: engines/audio (spotting on the server, loudness meter in the browser)

import { MusicSuggestionPanel } from "./components/MusicSuggestion";
import { can, useProjectAccess } from "@/lib/useProjectAccess";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAudio } from "./hooks/useAudio";
import { Timeline } from "./components/Timeline";
import { ClipInspector } from "./components/ClipInspector";
import { Mixer } from "./components/Mixer";
import { DeliveryPanel, GeneratorsPanel } from "./components/DeliveryPanel";
import { Player } from "./state/mixEngine";
import type { AudioTrack } from "@aurastage/contracts";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export default function AudioStudioPage() {
  const { id } = useParams<{ id: string }>();
  const d = useAudio(id);
  const access = useProjectAccess(id);
  const canGenerate = can(access, "audio", "generate");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [clipId, setClipId] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [pps, setPps] = useState(60);
  const [pos, setPos] = useState(0);
  const player = useRef(new Player()).current;
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setPos(player.position());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, player]);
  useEffect(() => () => player.stop(), [player]);
  // Saved track settings (or a failed save's rollback) always reach what is playing.
  const curTracks = (d.ws?.scenes.find((x) => x.scene.id === sceneId) ?? d.ws?.scenes[0])?.tracks;
  useEffect(() => { if (curTracks) player.setLive(curTracks); }, [curTracks, player]);

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening the Audio Studio…</div>;
  if (!d.project || !d.ws) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{d.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  const ws = d.ws;
  const s = ws.scenes.find((x) => x.scene.id === sceneId) ?? ws.scenes[0] ?? null;
  const clip = s?.clips.find((c) => c.id === clipId) ?? null;
  // New clips go on the chosen track (click a track name), else the first one.
  const clipTrack = s?.tracks.find((t) => t.id === trackId) ?? s?.tracks[0] ?? null;
  const seconds = s?.session?.scene_seconds ?? 0;

  async function togglePlay() {
    if (!s?.session) return;
    if (player.playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    await player.play(pos >= seconds ? 0 : pos, s.tracks, s.clips, d.buffers, s.session.mix);
    setPlaying(true);
    const stopAt = (seconds - (pos >= seconds ? 0 : pos)) * 1000 + 200;
    setTimeout(() => {
      if (player.playing) {
        player.stop();
        setPlaying(false);
        setPos(seconds);
      }
    }, stopAt);
  }

  return (
    <AppShell
      project={d.project}
      active="audio"
      actions={
        <>
          <Link href={`/projects/${id}/visual`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Visual Generation
          </Link>
          <Link href={`/projects/${id}/editorial`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Editorial & Timeline →
          </Link>
        </>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Audio Studio</p>
        <h1 className="mt-2 font-display text-4xl">
          Professional Sound for <span className="text-aura-gold">Cinematic Storytelling</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Every approved scene gets a session with dialogue, effects, ambience and music cues placed from your shot plan
          and Scene DNA. Add your recordings, mix them, measure the real loudness and export stems.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span className="rounded-md border border-aura-border px-3 py-1.5">Storyboard · approved shot timing</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Audio Studio</span>
          <span className="text-white/30">→ Editorial & Timeline</span>
        </div>
        <p className="text-sm text-white/60">
          <span className="text-emerald-300">{ws.summary.approved}</span> of {ws.summary.scenes} scenes have an approved mix · {ws.assets.length} recordings in the library
        </p>
        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}

        {ws.scenes.length > 0 && (
          <div className="rounded-xl border border-aura-gold/30 bg-aura-panel p-3" aria-label="Whole film">
            <p className="text-xs uppercase tracking-wider text-white/50">Whole film — one click each, in order (every scene can still be done by hand below)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => d.spotAll()} disabled={d.busy !== null} className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40">
                1 · Spot all scenes
              </button>
              <button onClick={() => d.generateAll()} disabled={d.busy !== null || !canGenerate || !ws.scenes.some((x) => x.session)} title={canGenerate ? undefined : "Your role can't generate audio"}
                className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40">
                2 · Generate all planned sounds
              </button>
              <button onClick={() => d.placeGenerated(null)} disabled={d.busy !== null || !ws.scenes.some((x) => x.session)} className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40">
                3 · Place all generated sounds on their marked spots
              </button>
              <button onClick={() => d.measureApproveAll(ws.scenes)} disabled={d.busy !== null || !ws.scenes.some((x) => x.session)} className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40">
                4 · Measure and approve every scene's mix
              </button>
              <span className="self-center text-[11px] text-white/40">Listen and adjust any scene first if you like — approving again is always possible.</span>
            </div>
          </div>
        )}

        {!s ? (
          <div className="rounded-xl border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
            No scenes with an approved shot plan yet.{" "}
            <Link href={`/projects/${id}/storyboard`} className="text-aura-gold underline">
              Approve a scene's shots in Storyboard →
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Scenes">
              {ws.scenes.map((x) => (
                <button
                  key={x.scene.id}
                  role="tab"
                  aria-selected={x.scene.id === s.scene.id}
                  onClick={() => (player.stop(), setPlaying(false), setPos(0), setClipId(null), setSceneId(x.scene.id))}
                  className={`rounded-md border px-3 py-1.5 text-sm ${x.scene.id === s.scene.id ? "border-aura-gold text-aura-gold" : "border-aura-border text-white/60"}`}
                >
                  {x.scene.number}. {x.scene.heading}
                  {x.session?.status === "approved" && x.session.review_state === "current" && <span className="ml-1 text-emerald-300">✓</span>}
                  {x.session && x.session.review_state !== "current" && <span className="ml-1 text-aura-gold">!</span>}
                </button>
              ))}
            </div>

            {s.session && s.session.review_state !== "current" && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${s.session.review_state === "stale" ? "border-red-400/40 text-red-200" : "border-aura-gold/40 text-aura-gold"}`}>
                <p className="font-medium">This scene's audio needs review.</p>
                <p className="mt-1 text-xs opacity-90">{s.session.review_reason}</p>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-aura-border bg-aura-panel p-3">
                  <button
                    onClick={() => d.spot(s.scene.id)}
                    disabled={!s.plan?.usable || d.busy !== null}
                    className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40"
                  >
                    {d.busy === "spot" ? "Spotting…" : s.session ? "Re-spot from upstream" : "Spot audio from the shot plan"}
                  </button>
                  {s.session && (
                    <>
                      <button onClick={togglePlay} aria-label={playing ? "Stop" : "Play"} className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black">
                        {playing ? "■ Stop" : "▶ Play"}
                      </button>
                      <span className="font-mono text-sm tabular-nums" aria-label="Position">
                        {fmt(pos)} / {fmt(seconds)}
                      </span>
                      <button onClick={() => (player.stop(), setPlaying(false), setPos(0))} className="rounded border border-aura-border px-2 py-1 text-xs">
                        ⏮ Start
                      </button>
                      <label className="flex items-center gap-2 text-xs text-white/50">
                        Zoom
                        <input aria-label="Zoom" type="range" min={20} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
                      </label>
                      <span className="flex-1" />
                      <button
                        onClick={() => d.createClip(s.session!.id, { track_id: clipTrack!.id, label: "New clip", start_seconds: Math.round(pos * 100) / 100, duration_seconds: 2 })}
                        disabled={d.busy !== null || !clipTrack}
                        className="rounded border border-aura-border px-3 py-1.5 text-xs disabled:opacity-40"
                      >
                        + Add clip on {clipTrack?.name ?? "a track"} at playhead
                      </button>
                      <button onClick={() => d.undo()} disabled={d.busy !== null || !d.undoLabel} title={d.undoLabel ? `Undo the ${d.undoLabel} (Ctrl+Z)` : "Nothing to undo"}
                        className="rounded border border-aura-border px-3 py-1.5 text-xs disabled:opacity-40">
                        ↶ Undo{d.undoLabel ? ` ${d.undoLabel}` : ""}
                      </button>
                    </>
                  )}
                  {!s.plan?.usable && <span className="text-xs text-aura-gold">Approve this scene's shot plan again in Storyboard to (re-)spot.</span>}
                </div>

                {s.session && d.busy === null && (
                  <ClipKeys on={{
                    " ": () => void togglePlay(),
                    undo: d.undoLabel ? () => void d.undo() : null,
                    s: clip && pos > clip.start_seconds + 0.05 && pos < clip.start_seconds + clip.duration_seconds - 0.05 ? () => void d.splitClip(s.session!.id, clip, pos) : null,
                    m: clip ? () => void d.editClip(clip, { muted: !clip.muted }, clip.muted ? `unmute of “${clip.label}”` : `mute of “${clip.label}”`) : null,
                    delete: clip ? () => void d.removeClip(s.session!.id, clip).then((r) => r !== null && setClipId(null)) : null,
                    d: clip ? () => void d.duplicateClip(s.session!.id, clip).then((c2) => c2 && setClipId(c2.id)) : null,
                    "[": clip && pos > clip.start_seconds + 0.05 && pos < clip.start_seconds + clip.duration_seconds - 0.05
                      ? () => { const dd = Math.round((pos - clip.start_seconds) * 100) / 100; void d.editClip(clip, { start_seconds: Math.round(pos * 100) / 100, offset_seconds: Math.round((clip.offset_seconds + dd) * 100) / 100, duration_seconds: Math.round((clip.duration_seconds - dd) * 100) / 100 }, `trim of the start of “${clip.label}”`); } : null,
                    "]": clip && pos > clip.start_seconds + 0.05 && pos < clip.start_seconds + clip.duration_seconds - 0.05
                      ? () => void d.editClip(clip, { duration_seconds: Math.round((pos - clip.start_seconds) * 100) / 100 }, `trim of the end of “${clip.label}”`) : null,
                  }} />
                )}
                {s.session && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-aura-border bg-black/20 px-3 py-2 text-xs" aria-label="Clip tools">
                    <span className="mr-1 text-white/50">{clip ? <>Selected: <span className="text-white/80">{clip.label}</span></> : "Select a clip on the timeline to edit it"}</span>
                    {(() => {
                      const off = d.busy !== null || !clip;
                      const inside = !!clip && pos > clip.start_seconds + 0.05 && pos < clip.start_seconds + clip.duration_seconds - 0.05;
                      const b = "rounded border border-aura-border px-2 py-1 disabled:opacity-40";
                      return (
                        <>
                          <button className={b} disabled={off || !inside} title="Split at the playhead (S)" onClick={() => clip && d.splitClip(s.session!.id, clip, pos)}>✂ Split</button>
                          <button className={b} disabled={off} title="Mute or bring back this clip without deleting it (M)" aria-pressed={!!clip?.muted}
                            onClick={() => clip && d.editClip(clip, { muted: !clip.muted }, clip.muted ? `unmute of “${clip.label}”` : `mute of “${clip.label}”`)}>
                            {clip?.muted ? "🔈 Unmute clip" : "🔇 Mute clip"}
                          </button>
                          <button className={b} disabled={off || !inside} title="Remove everything before the playhead ([)"
                            onClick={() => { if (!clip) return; const dd = Math.round((pos - clip.start_seconds) * 100) / 100; d.editClip(clip, { start_seconds: Math.round(pos * 100) / 100, offset_seconds: Math.round((clip.offset_seconds + dd) * 100) / 100, duration_seconds: Math.round((clip.duration_seconds - dd) * 100) / 100 }, `trim of the start of “${clip.label}”`); }}>⇤ Trim start to playhead</button>
                          <button className={b} disabled={off || !inside} title="Remove everything after the playhead (])"
                            onClick={() => clip && d.editClip(clip, { duration_seconds: Math.round((pos - clip.start_seconds) * 100) / 100 }, `trim of the end of “${clip.label}”`)}>Trim end to playhead ⇥</button>
                          <button className={b} disabled={off} title="Fade in over 0.5 s" onClick={() => clip && d.editClip(clip, { fade_in_seconds: Math.min(clip.duration_seconds / 2, 0.5) }, `fade-in on “${clip.label}”`)}>◢ Fade in</button>
                          <button className={b} disabled={off} title="Fade out over 0.5 s" onClick={() => clip && d.editClip(clip, { fade_out_seconds: Math.min(clip.duration_seconds / 2, 0.5) }, `fade-out on “${clip.label}”`)}>Fade out ◣</button>
                          <button className={b} disabled={off || (clip?.gain_db ?? 0) <= -57} title="3 dB quieter" onClick={() => clip && d.editClip(clip, { gain_db: Math.max(-60, clip.gain_db - 3) }, `volume of “${clip.label}” (−3 dB)`)}>−3 dB</button>
                          <button className={b} disabled={off || (clip?.gain_db ?? 0) >= 9} title="3 dB louder" onClick={() => clip && d.editClip(clip, { gain_db: Math.min(12, clip.gain_db + 3) }, `volume of “${clip.label}” (+3 dB)`)}>+3 dB</button>
                          <button className={b} disabled={off} title="Copy right after this clip (D)" onClick={async () => { if (!clip) return; const c2 = await d.duplicateClip(s.session!.id, clip); if (c2) setClipId(c2.id); }}>⧉ Duplicate</button>
                          <button className={`${b} text-red-300`} disabled={off} title="Delete — Undo brings it back (Delete)" onClick={async () => { if (clip && (await d.removeClip(s.session!.id, clip)) !== null) setClipId(null); }}>🗑 Delete</button>
                          <span className="ml-auto text-[10px] text-white/35">Drag a clip&apos;s edges to trim · Space play · S split · M mute · [ ] trim · D duplicate · Del delete · Ctrl+Z undo</span>
                        </>
                      );
                    })()}
                  </div>
                )}
                {s.session ? (
                  <>
                    <Timeline
                      seconds={seconds}
                      tracks={s.tracks}
                      clips={s.clips}
                      buffers={d.buffers}
                      pps={pps}
                      position={pos}
                      selectedClipId={clip?.id ?? null}
                      busy={d.busy !== null}
                      onSelectClip={setClipId}
                      onMoveClip={(cid, start) => { const c0 = s.clips.find((x) => x.id === cid); if (c0) d.editClip(c0, { start_seconds: start }, `move of “${c0.label}” to ${start.toFixed(2)}s`); }}
                      onTrimClip={(cid, patch) => { const c0 = s.clips.find((x) => x.id === cid); if (c0) d.editClip(c0, patch, `trim of “${c0.label}”`); }}
                      onSeek={(t) => (player.stop(), setPlaying(false), setPos(t))}
                      onTrackChange={(tid, patch) => (player.setLive(s.tracks.map((x) => (x.id === tid ? { ...x, ...patch } : x))), d.updateTrack(tid, patch, patch.name ? `Renamed to “${patch.name}”.` : null))}
                      selectedTrackId={clipTrack?.id ?? null}
                      onSelectTrack={setTrackId}
                      onAddTrack={async (name, family) => {
                        const t = await d.addTrack(s.session!.id, { name, family: family as AudioTrack["family"] });
                        if (t) setTrackId(t.id);
                        return t;
                      }}
                      onMoveTrack={(tid, dir) => d.moveTrack(tid, dir)}
                      onRemoveTrack={(tid) => d.deleteTrack(tid)}
                    />
                    {clip && (
                      <ClipInspector
                        key={`${clip.id}:${clip.updated_at}`}
                        clip={clip}
                        tracks={s.tracks}
                        assets={ws.assets}
                        busy={d.busy !== null}
                        onSave={(p) => d.editClip(clip, p, `change to “${clip.label}”`)}
                        onDelete={async () => { if ((await d.removeClip(s.session!.id, clip)) !== null) setClipId(null); }}
                        onUpload={(file) => d.upload(file, { clipId: clip.id })}
                        generations={s.generations.filter((g) => g.clip_id === clip.id)}
                        canGenerate={canGenerate}
                        onGenerate={(body) => d.generate(s.scene.id, body)}
                        voiceReady={ws.generators.some((g) => g.kinds.includes("voice") && g.state === "configured")}
                        paid={ws.generators.filter((g) => g.execution === "external" && g.state === "configured").map((g) => ({ id: g.id, label: g.label, kinds: g.kinds }))}
                      />
                    )}
                    <Mixer tracks={s.tracks} clips={s.clips} player={player} busy={d.busy !== null} seconds={seconds} position={pos}
                      mix={s.session.mix} measurement={s.measurement} target={ws.target}
                      onChange={(tid, p, msg) => (player.setLive(s.tracks.map((x) => (x.id === tid ? { ...x, ...p } : x))), d.updateTrack(tid, p, msg ?? null))} onMix={(mix, msg) => d.updateMix(s.scene.id, mix, s.session!.revision, msg)} />
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed border-aura-border p-8 text-center text-sm text-white/50">
                    Spot this scene to lay out dialogue, effects, ambience and music cues from the approved shot plan.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                {s.session && (
                  <DeliveryPanel s={s} target={ws.target} busy={d.busy} onMeasure={() => d.measure(s)} onApprove={() => d.approve(s.scene.id)} onExport={(bus) => d.exportStem(s, bus)} />
                )}
                {s.music_suggestion && (
                  <MusicSuggestionPanel m={s.music_suggestion} spotted={!!s.session} busy={d.busy !== null}
                    onAddAmbient={async () => {
                      const amb = s.music_suggestion?.ambient;
                      const track = s.tracks.find((t) => t.family === "SCORE") ?? s.tracks.find((t) => t.family === "MX");
                      if (!amb || !s.session || !track || seconds <= 0) return;
                      // A planned clip across the scene at bed level; the built-in generator makes the bed, and the person chooses “Use this”.
                      const c = await d.createClip(s.session.id, { track_id: track.id, label: "Ambient bed", start_seconds: 0, duration_seconds: Math.min(3600, seconds), gain_db: amb.level_db });
                      if (!c) return;
                      setClipId(c.id);
                      await d.generate(s.scene.id, { clip_id: c.id, kind: "score", description: amb.description, duration_seconds: Math.min(300, seconds) });
                    }} />
                )}
                <GeneratorsPanel generators={ws.generators} canGenerate={canGenerate} busy={d.busy !== null} onGenerateCues={s.session ? () => d.generateCues(s.scene.id) : null} onPlace={s.session ? () => d.placeGenerated(s.scene.id) : null} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Keyboard editing on the timeline (2026-10-02). Ignored while typing in a field. */
function ClipKeys({ on }: { on: Record<string, (() => void) | null> }) {
  // The latest handlers without re-binding the listener on every frame of playback.
  const ref = useRef(on);
  ref.current = on;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const key = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" ? "undo" : e.ctrlKey || e.metaKey || e.altKey ? null
        : e.key === "Delete" || e.key === "Backspace" ? "delete" : e.key.toLowerCase();
      const fn = key ? ref.current[key] : null;
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return null;
}
