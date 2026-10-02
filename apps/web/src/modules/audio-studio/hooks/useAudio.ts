"use client";

// Loads and mutates the Audio Studio workspace. Every change goes through the
// API and the screen reloads from it, so what you see is what is stored.
// Recordings are decoded once per asset and reused for playback, waveforms,
// measurement and export.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddAudioTrackInput, AudioClip, Project, SaveAudioClipInput, SessionMix, UpdateAudioTrackInput } from "@aurastage/contracts";
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
  // Undo for clip edits (2026-10-02): newest last, kept for this visit to the page (up to 30 steps). A clip restored by
  // Undo gets a new id; `ids` maps old ids to new so earlier steps still find it.
  const undoRef = useRef<{ what: string; fn: () => Promise<void> }[]>([]);
  const [undo, setUndo] = useState<{ what: string; fn: () => Promise<void> }[]>([]);
  const ids = useRef(new Map<string, string>());
  const resolve = (id: string) => { let x = id; for (let i = 0; i < 30 && ids.current.has(x); i++) x = ids.current.get(x)!; return x; };
  const pushUndo = (what: string, fn: () => Promise<void>) => { undoRef.current = [...undoRef.current, { what, fn }].slice(-30); setUndo(undoRef.current); };
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
  // One refresh at a time, and less often when many sounds are queued (a whole film's worth).
  const many = (ws?.scenes.reduce((n, sc) => n + (sc.generations?.filter((g) => g.status === "queued" || g.status === "running").length ?? 0), 0) ?? 0) > 30;
  useEffect(() => {
    if (!waiting) return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => { await reload().catch(() => null); if (!stop) t = setTimeout(tick, many ? 8000 : 2500); };
    t = setTimeout(tick, many ? 8000 : 2500);
    return () => { stop = true; clearTimeout(t); };
  }, [waiting, reload, many]);

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
    reload,
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
    /** Splits a clip in two at `at` (scene seconds): the second half keeps playing the same recording from where the
     *  first stops. The new half is created first, so a failure never loses the end of the clip. Undo joins them again. */
    splitClip: (sessionId: string, c: AudioClip, at: number) =>
      run("save", async () => {
        const first = Math.round((at - c.start_seconds) * 100) / 100;
        if (first <= 0.05 || first >= c.duration_seconds - 0.05) throw new Error("Put the playhead inside the clip to split it.");
        const second = await audioApi.createClip(sessionId, {
          track_id: c.track_id, label: `${c.label} (2)`.slice(0, 200), asset_id: c.asset_id, start_seconds: Math.round(at * 100) / 100,
          duration_seconds: Math.round((c.duration_seconds - first) * 100) / 100, offset_seconds: Math.round((c.offset_seconds + first) * 100) / 100,
          gain_db: c.gain_db, fade_in_seconds: 0, fade_out_seconds: c.fade_out_seconds, muted: c.muted,
        });
        await audioApi.updateClip(c.id, { duration_seconds: first, fade_out_seconds: 0 });
        pushUndo(`split of “${c.label}”`, async () => {
          await audioApi.deleteClip(resolve(second.id));
          await audioApi.updateClip(resolve(c.id), { duration_seconds: c.duration_seconds, fade_out_seconds: c.fade_out_seconds });
        });
      }, () => `Split “${c.label}” at ${at.toFixed(2)}s. Undo joins it again.`),
    /** Any clip change (trim, fade, gain, mute, move…) with Undo: the previous values of exactly the changed fields. */
    editClip: (c: AudioClip, patch: SaveAudioClipInput, what: string) =>
      run("save", async () => {
        const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, (c as unknown as Record<string, unknown>)[k]])) as SaveAudioClipInput;
        await audioApi.updateClip(c.id, patch);
        pushUndo(what, async () => { await audioApi.updateClip(resolve(c.id), prev); });
      }, () => `${what[0].toUpperCase()}${what.slice(1)}. Undo (Ctrl+Z) puts it back.`),
    /** Deletes a clip; Undo restores the same clip (its recording, timing, fades, mute and the line it belongs to). */
    removeClip: (sessionId: string, c: AudioClip) =>
      run("save", async () => {
        await audioApi.deleteClip(c.id);
        pushUndo(`delete of “${c.label}”`, async () => {
          const back = await audioApi.createClip(sessionId, {
            track_id: c.track_id, label: c.label, asset_id: c.asset_id, start_seconds: c.start_seconds, duration_seconds: c.duration_seconds,
            offset_seconds: c.offset_seconds, gain_db: c.gain_db, fade_in_seconds: c.fade_in_seconds, fade_out_seconds: c.fade_out_seconds,
            muted: c.muted, source: c.source,
          });
          ids.current.set(c.id, back.id);
        });
      }, () => `Removed “${c.label}”. Undo (Ctrl+Z) brings it back.`),
    /** A copy right after the clip on the same track. */
    duplicateClip: (sessionId: string, c: AudioClip) =>
      run("save", async () => {
        const copy = await audioApi.createClip(sessionId, {
          track_id: c.track_id, label: `${c.label} (copy)`.slice(0, 200), asset_id: c.asset_id, start_seconds: Math.round((c.start_seconds + c.duration_seconds) * 100) / 100,
          duration_seconds: c.duration_seconds, offset_seconds: c.offset_seconds, gain_db: c.gain_db, fade_in_seconds: c.fade_in_seconds, fade_out_seconds: c.fade_out_seconds, muted: c.muted,
        });
        pushUndo(`duplicate of “${c.label}”`, async () => { await audioApi.deleteClip(resolve(copy.id)); });
        return copy;
      }, () => `Duplicated “${c.label}” right after it.`),
    undoLabel: undo.length ? undo[undo.length - 1].what : null,
    undo: () =>
      run("save", async () => {
        const last = undoRef.current.pop();
        setUndo([...undoRef.current]);
        if (!last) throw new Error("Nothing to undo.");
        await last.fn();
        return last.what;
      }, (what) => `Undid the ${what}.`),
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
    /**
     * Whole film (owner, 2026-10-02): render and measure each spotted scene's mix in this browser, then approve it when its
     * checks pass. Scenes already approved and current are skipped; a scene whose checks fail is listed with the reason
     * and left for the person.
     */
    measureApproveAll: (scenes: AudioScene[]) =>
      run(
        "measure",
        async () => {
          let approved = 0;
          const left: string[] = [];
          for (const s of scenes) {
            if (!s.session || (s.session.status === "approved" && s.session.review_state === "current")) continue;
            if (missing(s)) { left.push(`scene ${s.scene.number}: recordings still loading`); continue; }
            const buf = await renderMix(s.session.scene_seconds, s.tracks, s.clips, buffers, undefined, s.session.mix);
            const r = measure(buf);
            await audioApi.recordMeasurement(s.session.id, {
              integrated_lufs: r.integrated_lufs, true_peak_dbtp: r.true_peak_dbtp, lra_lu: r.lra_lu, duration_seconds: r.duration_seconds,
              clip_count: s.clips.filter((c) => c.kind === "asset").length, engine_version: r.engine_version, session_revision: s.session.revision,
            });
            try { await audioApi.approve(projectId, s.scene.id); approved++; }
            catch (e) { left.push(`scene ${s.scene.number}: ${e instanceof Error ? e.message : "not ready"}`); }
          }
          return { approved, left };
        },
        (r) => `Measured and approved ${r.approved} scene mix${r.approved === 1 ? "" : "es"}.${r.left.length ? ` Not yet: ${r.left.join("; ")}` : ""}`
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
    generate: (sceneId: string, body: { clip_id: string | null; kind: AudioGeneration["kind"]; description: string; duration_seconds: number; provider?: string }) =>
      run("generate", () => audioApi.generate(projectId, sceneId, body), () => "Generating — it will appear here and in the Assets Library when it's ready."),
    generateCues: (sceneId: string) =>
      run("generate", () => audioApi.generateCues(projectId, sceneId), (r) =>
        r.requested.length
          ? `Generating ${r.requested.length} planned sound${r.requested.length === 1 ? "" : "s"} with the built-in generators${r.skipped.length ? ` (${r.skipped.length} already generated or not supported)` : ""}.${r.waiting ? ` ${r.waiting} more wait for the generator to catch up — press again in a moment, or use “Do 1–3 for the whole film”, which carries on by itself.` : ""} Nothing is placed until you choose “Use this”.`
          : "Nothing new to generate — every ambience, effect and score cue already has a generated sound or a recording."),
    spotAll: () =>
      run("spot", () => audioApi.spotAll(projectId), (r) =>
        `${r.spotted.length ? `Spotted ${r.spotted.length} scene${r.spotted.length === 1 ? "" : "s"} (${r.spotted.join(", ")}).` : "No new scenes to spot."}${r.already ? ` ${r.already} already spotted — re-spot those one by one if their shot plan changed.` : ""}${r.waiting.length ? ` Scene${r.waiting.length === 1 ? "" : "s"} ${r.waiting.join(", ")} still need an approved shot plan in Storyboard.` : ""}`),
    generateAll: () =>
      run("generate", async () => {
        let requested = 0, skipped = 0, scenes = 0;
        for (let round = 0; round < 40; round++) {
          const r = await audioApi.generateAll(projectId);
          requested += r.requested; skipped = r.skipped; scenes = r.scenes;
          if (!r.remaining) break;
          setNotice(`Generating planned sounds… ${requested} queued so far.`);
        }
        return { requested, skipped, scenes };
      }, (r) =>
        r.requested
          ? `Generating ${r.requested} planned sound${r.requested === 1 ? "" : "s"} across ${r.scenes} scene${r.scenes === 1 ? "" : "s"} with the built-in generators${r.skipped ? ` (${r.skipped} already generated or not supported)` : ""}. When they're ready, “Place generated sounds” puts each on its marked spot.`
          : "Nothing new to generate — every planned sound already has a generated sound or a recording."),
    placeGenerated: (sceneId: string | null) =>
      run("save", async () => {
        let placed = 0, last = { still_making: 0, not_generated: 0 };
        for (let round = 0; round < 40; round++) {
          const r = await audioApi.placeGenerated(projectId, sceneId);
          placed += r.placed; last = r;
          if (!r.remaining || !r.placed) break;
          setNotice(`Placing sounds… ${placed} placed, ${r.remaining} to go.`);
        }
        return { placed, still_making: last.still_making, not_generated: last.not_generated };
      }, (r) =>
        `Placed ${r.placed} generated sound${r.placed === 1 ? "" : "s"} on ${r.placed === 1 ? "its" : "their"} marked spot${r.placed === 1 ? "" : "s"}${sceneId ? "" : " across the film"}.${r.still_making ? ` ${r.still_making} still being made — press again when they're ready.` : ""}${r.not_generated ? ` ${r.not_generated} planned cue${r.not_generated === 1 ? " has" : "s have"} no generated sound yet (dialogue without a voice, or not generated).` : ""} Recordings already on the timeline were kept; every clip can still be moved, trimmed or replaced.`),
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
