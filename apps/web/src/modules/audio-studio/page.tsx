"use client";

// apps/web/src/modules/audio-studio/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Audio Studio workspace (docs/design/UI_REFERENCE.md §9).
// Canonical backend authority: apps/api/src/modules/audio (+ assets for recordings)
// Engines: engines/audio (spotting on the server, loudness meter in the browser)

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

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export default function AudioStudioPage() {
  const { id } = useParams<{ id: string }>();
  const d = useAudio(id);
  const access = useProjectAccess(id);
  const canGenerate = can(access, "audio", "generate");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [clipId, setClipId] = useState<string | null>(null);
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
  const seconds = s?.session?.scene_seconds ?? 0;

  async function togglePlay() {
    if (!s?.session) return;
    if (player.playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    await player.play(pos >= seconds ? 0 : pos, s.tracks, s.clips, d.buffers);
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
                        onClick={() => d.createClip(s.session!.id, { track_id: s.tracks[0].id, label: "New clip", start_seconds: Math.round(pos * 100) / 100, duration_seconds: 2 })}
                        disabled={d.busy !== null || !s.tracks.length}
                        className="rounded border border-aura-border px-3 py-1.5 text-xs disabled:opacity-40"
                      >
                        + Add clip at playhead
                      </button>
                    </>
                  )}
                  {!s.plan?.usable && <span className="text-xs text-aura-gold">Approve this scene's shot plan again in Storyboard to (re-)spot.</span>}
                </div>

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
                      onMoveClip={(cid, start) => d.updateClip(cid, { start_seconds: start }, `Moved to ${start.toFixed(2)}s.`)}
                      onSeek={(t) => (player.stop(), setPlaying(false), setPos(t))}
                      onTrackChange={(tid, patch) => d.updateTrack(tid, patch)}
                    />
                    {clip && (
                      <ClipInspector
                        key={`${clip.id}:${clip.updated_at}`}
                        clip={clip}
                        tracks={s.tracks}
                        assets={ws.assets}
                        busy={d.busy !== null}
                        onSave={(p) => d.updateClip(clip.id, p)}
                        onDelete={async () => (await d.deleteClip(clip.id)) && setClipId(null)}
                        onUpload={(file) => d.upload(file, { clipId: clip.id })}
                        generations={s.generations.filter((g) => g.clip_id === clip.id)}
                        canGenerate={canGenerate}
                        onGenerate={(body) => d.generate(s.scene.id, body)}
                      />
                    )}
                    <Mixer tracks={s.tracks} player={player} busy={d.busy !== null} onChange={(tid, p) => d.updateTrack(tid, p)} />
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
                <GeneratorsPanel generators={ws.generators} canGenerate={canGenerate} busy={d.busy !== null} onGenerateCues={s.session ? () => d.generateCues(s.scene.id) : null} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
