"use client";

// Loads and mutates the Audio Studio workspace. Every change goes through the
// API and the screen reloads from it, so what you see is what is stored.
// Recordings are decoded once per asset and reused for playback, waveforms,
// measurement and export.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddAudioTrackInput, Project, SaveAudioClipInput, SessionMix, UpdateAudioTrackInput } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { audioApi } from "../api/audioApi";
import { useAssistantChanges } from "@/modules/ask-aurastage/askBus";
import type { AudioGeneration, AudioScene, AudioWorkspace } from "../types";
import { encodeWav, loadAsset, measure, probeFile, renderMix, type Bus } from "../state/mixEngine";

type Busy = null | "spot" | "save" | "upload" | "measure" | "approve" | "export" | "generate";

export function useAudio(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<AudioWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Map<string, AudioBuffer>>(new Map());
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const w = await audioApi.getWorkspace(projectId);
    if (alive.current) setWs(w);
    return w;
  }, [projectId]);
  // Ask AuraStage changed a track: show it at once.
  useAssistantChanges(reload);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      try {
        const [p] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), reload()]);
        if (alive.current) setProject(p);
      } catch (err) {
        if (alive.current) setError(err instanceof Error ? err.message : "Could not load the Audio Studio");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [projectId, router, reload]);

  // Decode every recording used in the workspace (once each).
  useEffect(() => {
    if (!ws) return;
    const ids = new Set(ws.scenes.flatMap((s) => s.clips.filter((c) => c.asset_id).map((c) => c.asset_id!)));
    for (const id of ids) {
      if (buffers.has(id)) continue;
      loadAsset(id)
        .then((b) => alive.current && setBuffers((m) => new Map(m).set(id, b)))
        .catch(() => alive.current && setError("A recording could not be loaded for playback."));
    }
  }, [ws, buffers]);

  // Generation runs in the worker: check back every 2 s while anything is waiting or being made.
  const waiting = ws?.scenes.some((sc) => sc.generations?.some((g) => g.status === "queued" || g.status === "running")) ?? false;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => reload().catch(() => null), 2000);
    return () => clearInterval(t);
  }, [waiting, reload]);

  async function run<T>(kind: Busy, fn: () => Promise<T>, message: (r: T) => string | null) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      await reload();
      const m = message(r);
      if (m) setNotice(m);
      return r;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const missing = (s: AudioScene) => s.clips.filter((c) => c.asset_id && !buffers.has(c.asset_id)).length;

  return {
    project, ws, loading, busy, error, notice, buffers,
    spot: (sceneId: string) =>
      run("spot", () => audioApi.spot(projectId, sceneId), (r) => `Spotted ${r.cues} cues on ${r.tracks} tracks from shot plan version ${r.shot_plan_version_number}. Recordings you've placed are kept.`),
    updateTrack: (id: string, patch: UpdateAudioTrackInput, msg: string | null = null) => run("save", () => audioApi.updateTrack(id, patch), () => msg),
    addTrack: (sessionId: string, input: AddAudioTrackInput) => run("save", () => audioApi.addTrack(sessionId, input), (t) => `Track “${t.name}” added — it stays when the scene is re-spotted.`),
    moveTrack: (id: string, direction: -1 | 1) => run("save", () => audioApi.moveTrack(id, direction), () => null),
    deleteTrack: (id: string) => run("save", () => audioApi.deleteTrack(id), () => "Track removed."),
    updateMix: (sceneId: string, mix: SessionMix, revision: string, msg = "Mix routing saved — measure the mix again before approving.") =>
      run("save", () => audioApi.updateMix(projectId, sceneId, mix, revision), () => msg),
    createClip: (sessionId: string, patch: SaveAudioClipInput) => run("save", () => audioApi.createClip(sessionId, patch), () => "Clip added."),
    updateClip: (id: string, patch: SaveAudioClipInput, msg: string | null = "Clip saved.") => run("save", () => audioApi.updateClip(id, patch), () => msg),
    deleteClip: (id: string) => run("save", () => audioApi.deleteClip(id), () => "Clip removed."),
    /** Uploads a recording (after decoding it locally to prove it's playable) and optionally places it on a clip. */
    upload: (file: File, placeOn?: { clipId: string }) =>
      run(
        "upload",
        async () => {
          const probe = await probeFile(file).catch(() => {
            throw new Error("That file couldn't be played as audio in this browser.");
          });
          const asset = await audioApi.uploadAudio(projectId, file, { name: file.name, duration: probe.duration, sample_rate: probe.sample_rate, channels: probe.channels });
          setBuffers((m) => new Map(m).set(asset.id, probe.buffer));
          if (placeOn) await audioApi.updateClip(placeOn.clipId, { asset_id: asset.id, label: file.name.replace(/\.[^.]+$/, ""), duration_seconds: Math.max(0.1, probe.duration) });
          return asset;
        },
        (a) => `“${a.name}” uploaded${placeOn ? " and placed on the clip" : ""}.`
      ),
    measure: (s: AudioScene) =>
      run(
        "measure",
        async () => {
          if (missing(s)) throw new Error("Some recordings are still loading — try again in a moment.");
          const buf = await renderMix(s.session!.scene_seconds, s.tracks, s.clips, buffers, undefined, s.session!.mix);
          const r = measure(buf);
          return audioApi.recordMeasurement(s.session!.id, {
            integrated_lufs: r.integrated_lufs, true_peak_dbtp: r.true_peak_dbtp, lra_lu: r.lra_lu, duration_seconds: r.duration_seconds,
            clip_count: s.clips.filter((c) => c.kind === "asset").length, engine_version: r.engine_version, session_revision: s.session!.revision,
          });
        },
        (m) => `Measured the rendered mix: ${m.integrated_lufs === null ? "silent" : `${m.integrated_lufs.toFixed(1)} LUFS`}${m.true_peak_dbtp === null ? "" : `, true peak ${m.true_peak_dbtp.toFixed(1)} dBTP`}.`
      ),
    generate: (sceneId: string, body: { clip_id: string | null; kind: AudioGeneration["kind"]; description: string; duration_seconds: number }) =>
      run("generate", () => audioApi.generate(projectId, sceneId, body), () => "Generating — it will appear here and in the Assets Library when it's ready."),
    generateCues: (sceneId: string) =>
      run("generate", () => audioApi.generateCues(projectId, sceneId), (r) =>
        r.requested.length
          ? `Generating ${r.requested.length} planned sound${r.requested.length === 1 ? "" : "s"} with the built-in generators${r.skipped.length ? ` (${r.skipped.length} already generated or not supported)` : ""}. Nothing is placed until you choose “Use this”.`
          : "Nothing new to generate — every ambience, effect and score cue already has a generated sound or a recording."),
    approve: (sceneId: string) => run("approve", () => audioApi.approve(projectId, sceneId), (r) => `Scene mix approved as version ${r.version_number}.`),
    exportStem: async (s: AudioScene, bus?: Bus) => {
      setBusy("export");
      setError(null);
      try {
        if (missing(s)) throw new Error("Some recordings are still loading — try again in a moment.");
        const buf = await renderMix(s.session!.scene_seconds, s.tracks, s.clips, buffers, bus, s.session!.mix);
        const url = URL.createObjectURL(encodeWav(buf));
        const a = document.createElement("a");
        a.href = url;
        a.download = `scene-${s.scene.number}-${bus ? `${bus}-stem` : "full-mix"}.wav`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setNotice(`Exported ${bus ? `the ${bus} stem` : "the full mix"} as WAV (48 kHz, 16-bit).`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(null);
      }
    },
  };
}
