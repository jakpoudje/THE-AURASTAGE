// Real ffmpeg: a generated 4 s clip with a tone is trimmed, sped up and muted exactly as asked, stored and recorded
// as a new version; a broken source fails the edit instead of storing anything.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ffmpeg } from "./ffmpeg";
import { measure } from "./probe";
import { editArgs, runVideoEditOnce, type VideoEditClaim } from "./videoEdit";

async function clip() {
  const dir = mkdtempSync(join(tmpdir(), "vedit-src-")), f = join(dir, "in.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f]);
  return readFileSync(f);
}
function deps(source: Uint8Array, claim: VideoEditClaim) {
  const store = mkdtempSync(join(tmpdir(), "vedit-store-"));
  const done: { id: string; key: string; meta: Record<string, unknown> }[] = [], failed: string[] = [];
  let claimed = false;
  return {
    store, done, failed,
    d: {
      claimEdit: async () => (claimed ? null : ((claimed = true), claim)),
      completeEdit: async (id: string, key: string, _c: string, meta: Record<string, unknown>) => (done.push({ id, key, meta }), 2),
      failEdit: async (_id: string, e: string) => void failed.push(e),
      fetchMedia: async () => ({ bytes: source, contentType: "video/mp4" }),
      putFile: async (key: string, path: string) => { const { copyFileSync } = await import("node:fs"); copyFileSync(path, join(store, key.split("/").pop()!)); },
      log: () => {},
    },
  };
}
const claim = (params: VideoEditClaim["params"]): VideoEditClaim => ({ id: "e1", org_id: "o", project_id: "p", asset_id: "a", source_version: 1, source_path: "k", params });

describe("video edits (migration 0050)", () => {
  it("builds the ffmpeg command: seek, end, speed on picture and sound, or no sound when muted", () => {
    expect(editArgs("i", "o", { trim_start: 1, trim_end: 3, mute: false, speed: 2 }, true).join(" ")).toContain("-ss 1 -to 3 -i i -filter:v setpts=PTS/2");
    expect(editArgs("i", "o", { trim_start: 0, trim_end: null, mute: false, speed: 2 }, true)).toContain("atempo=2");
    expect(editArgs("i", "o", { trim_start: 0, trim_end: null, mute: true, speed: 1 }, true)).toContain("-an");
  });
  it("trims 1 s–3 s at 2× speed (≈1 s long) and keeps the sound; muting removes it", async () => {
    const src = await clip();
    const a = deps(src, claim({ trim_start: 1, trim_end: 3, mute: false, speed: 2 }));
    expect(await runVideoEditOnce(a.d)).toBe(true);
    expect(a.failed).toEqual([]);
    const out = await measure(join(a.store, a.done[0].key.split("/").pop()!), false);
    expect(out.video!.duration).toBeGreaterThan(0.85);
    expect(out.video!.duration).toBeLessThan(1.2);
    expect(out.audio).not.toBeNull();
    expect(a.done[0].meta).toMatchObject({ media_type: "video/mp4", width: 320, height: 240 });
    const m = deps(src, claim({ trim_start: 0, trim_end: 2, mute: true, speed: 1 }));
    await runVideoEditOnce(m.d);
    const muted = await measure(join(m.store, m.done[0].key.split("/").pop()!), false);
    expect(muted.audio).toBeNull();
    expect(Math.abs(muted.video!.duration - 2)).toBeLessThan(0.15);
  }, 60000);
  it("a broken source fails the edit plainly and stores nothing", async () => {
    const b = deps(new TextEncoder().encode("not a video"), claim({ trim_start: 0, trim_end: null, mute: false, speed: 1 }));
    await runVideoEditOnce(b.d);
    expect(b.done).toEqual([]);
    expect(b.failed.length).toBe(1);
  }, 30000);
  it("nothing queued: returns false", async () => {
    const n = deps(new Uint8Array(), claim({ trim_start: 0, trim_end: null, mute: false, speed: 1 }));
    await n.d.claimEdit();
    expect(await runVideoEditOnce(n.d)).toBe(false);
  });
});
