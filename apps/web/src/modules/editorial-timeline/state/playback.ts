"use client";

// Timeline playback. The audio clock is the master: A1 scene mixes are rendered
// once per approved mix version with the Audio Studio's own mix engine (the same
// graph used there for playback, measurement and export) and scheduled at their
// timeline positions; picture follows the clock.
import type { AutomationPoint, TimelineClip } from "@aurastage/contracts";
import { timelineAutomation } from "@aurastage/engines";
import { SessionMixSchema, TrackFxSchema } from "@aurastage/contracts";
// Audio Studio's mix engine renders an approved mix snapshot exactly as it was approved.
import { liveContext, loadAsset, renderMix } from "@/modules/audio-studio/state/mixEngine";
import type { MixSnapshot } from "../types";

const rendered = new Map<string, Promise<AudioBuffer>>();
export function renderSceneMix(m: MixSnapshot): Promise<AudioBuffer> {
  if (!rendered.has(m.id)) {
    const p = (async () => {
      const ids = [...new Set(m.clips.filter((c) => c.kind === "asset" && c.asset_id).map((c) => c.asset_id!))];
      const bufs = new Map<string, AudioBuffer>();
      await Promise.all(ids.map(async (id) => bufs.set(id, await loadAsset(id))));
      const clips = m.clips.map((c) => ({ ...c, start_seconds: Number(c.start_seconds), duration_seconds: Number(c.duration_seconds), offset_seconds: Number(c.offset_seconds), gain_db: Number(c.gain_db), fade_in_seconds: Number(c.fade_in_seconds), fade_out_seconds: Number(c.fade_out_seconds) }));
      const tracks = m.tracks.map((t) => ({ ...t, gain_db: Number(t.gain_db), pan: Number(t.pan), fx: TrackFxSchema.parse(t.fx ?? {}) }));
      // With its channel strips and routing (buses, reverb/delay, master), exactly as approved in the Audio Studio.
      return renderMix(m.seconds, tracks, clips, bufs, undefined, SessionMixSchema.parse(m.mix ?? {}));
    })();
    p.catch(() => rendered.delete(m.id));
    rendered.set(m.id, p);
  }
  return rendered.get(m.id)!;
}

export class TimelinePlayer {
  private sources: AudioBufferSourceNode[] = [];
  private out: GainNode | null = null;
  private startedAt = 0;
  private from = 0;
  playing = false;
  constructor(private fps: number) {}

  async play(fromFrame: number, clips: TimelineClip[], mixes: Record<string, MixSnapshot>, automation: AutomationPoint[] = []) {
    this.stop();
    const c = liveContext();
    if (c.state === "suspended") await c.resume();
    // Timeline volume automation: one gain for the whole cut, following the drawn curve (straight lines in dB,
    // scheduled every frame so it matches the render worker's timelineAudioMixEngine).
    const out = c.createGain();
    out.connect(c.destination);
    this.out = out;
    const a1 = clips.filter((x) => x.track === "A1" && x.audio_session_version_id && mixes[x.audio_session_version_id]);
    const bufs = await Promise.all(a1.map((x) => renderSceneMix(mixes[x.audio_session_version_id!]).catch(() => null)));
    this.from = fromFrame / this.fps;
    this.startedAt = c.currentTime + 0.05;
    if (automation.length) {
      const end = Math.max(fromFrame, ...clips.map((x) => x.record_in + x.duration));
      const at = (f: number) => this.startedAt + (f - fromFrame) / this.fps;
      let prev = timelineAutomation.automationGainAt(automation, fromFrame), last = fromFrame;
      out.gain.setValueAtTime(prev, at(fromFrame));
      for (let f = fromFrame + 1; f <= end; f++) {
        const g = timelineAutomation.automationGainAt(automation, f);
        if (Math.abs(g - prev) > 1e-7) {
          if (last !== f - 1) out.gain.linearRampToValueAtTime(prev, at(f - 1)); // hold through the flat stretch
          out.gain.linearRampToValueAtTime(g, at(f));
          last = f;
        }
        prev = g;
      }
    }
    a1.forEach((clip, i) => {
      const buf = bufs[i];
      if (!buf) return;
      const start = clip.record_in / this.fps, len = clip.duration / this.fps, srcIn = clip.source_in / this.fps;
      if (start + len <= this.from) return;
      const skip = Math.max(0, this.from - start);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start(this.startedAt + Math.max(0, start - this.from), srcIn + skip, len - skip);
      this.sources.push(src);
    });
    this.playing = true;
  }
  /** Current frame. */
  position() {
    const t = this.playing ? this.from + Math.max(0, liveContext().currentTime - this.startedAt) : this.from;
    return Math.floor(t * this.fps + 1e-6);
  }
  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.out?.disconnect();
    this.out = null;
    this.playing = false;
  }
}
