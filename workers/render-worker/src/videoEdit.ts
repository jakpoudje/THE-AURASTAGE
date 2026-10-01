// workers/render-worker/src/videoEdit.ts
// Video edits from the Assets Library (migration 0050, BUILD_PLAN §8 item 34): trim start/end, mute, speed. The worker
// claims a queued edit, cuts the version it was made from with ffmpeg, stores the result next to the asset's other
// files and records it as a NEW version of the same asset (the earlier file is kept). Completing twice is a no-op;
// a crashed claim is re-queued by the database after 20 minutes (max 3 attempts).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ffmpeg } from "./ffmpeg";
import { measure } from "./probe";

export interface VideoEditClaim {
  id: string; org_id: string; project_id: string; asset_id: string; source_version: number; source_path: string;
  params: { trim_start: number; trim_end: number | null; mute: boolean; speed: number };
}
export interface VideoEditDeps {
  claimEdit(): Promise<VideoEditClaim | null>;
  completeEdit(id: string, storagePath: string, checksum: string, metadata: Record<string, unknown>): Promise<unknown>;
  failEdit(id: string, error: string): Promise<unknown>;
  fetchMedia(key: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  putFile(key: string, path: string, contentType: string): Promise<unknown>;
  log(event: string, data: Record<string, unknown>): void;
}

/** atempo accepts 0.5–2.0 per filter, so every supported speed is one filter. */
export function editArgs(input: string, output: string, p: VideoEditClaim["params"], hasAudio: boolean): string[] {
  const args = ["-ss", String(p.trim_start), ...(p.trim_end !== null ? ["-to", String(p.trim_end)] : []), "-i", input];
  const v = p.speed === 1 ? "null" : `setpts=PTS/${p.speed}`;
  args.push("-filter:v", v, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p");
  if (p.mute || !hasAudio) args.push("-an");
  else args.push("-filter:a", p.speed === 1 ? "anull" : `atempo=${p.speed}`, "-c:a", "aac", "-b:a", "192k");
  args.push("-movflags", "+faststart", output);
  return args;
}

export async function runVideoEditOnce(d: VideoEditDeps): Promise<boolean> {
  const e = await d.claimEdit();
  if (!e) return false;
  d.log("video_edit.claimed", { edit_id: e.id, asset_id: e.asset_id, params: e.params });
  const dir = mkdtempSync(join(tmpdir(), "aura-vedit-"));
  try {
    // measure() probes by extension; ffmpeg reads the real container whatever the name.
    const src = join(dir, "source.mp4"), out = join(dir, "edited.mp4");
    writeFileSync(src, (await d.fetchMedia(e.source_path)).bytes);
    const before = await measure(src, false).catch(() => null);
    await ffmpeg(editArgs(src, out, e.params, !!before?.audio));
    const m = await measure(out, false);
    if (!m.video || !(m.video.duration > 0)) throw new Error("The edited file has no picture.");
    const key = `${e.org_id}/${e.project_id}/assets/${randomUUID()}.mp4`;
    await d.putFile(key, out, "video/mp4");
    const meta = { media_type: "video/mp4", size_bytes: m.bytes, duration_seconds: Math.round(m.video.duration * 1000) / 1000, width: m.video.width, height: m.video.height, fps: m.video.fps };
    const version = await d.completeEdit(e.id, key, m.sha256 ?? "", meta);
    d.log("video_edit.completed", { edit_id: e.id, version, seconds: meta.duration_seconds });
  } catch (err) {
    await d.failEdit(e.id, (err as Error).message || "Edit failed");
    d.log("video_edit.failed", { edit_id: e.id, error: (err as Error).message });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return true;
}
