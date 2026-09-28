import { describe, expect, it } from "vitest";
import { runOnce, type Claim, type WorkerDeps } from "./worker";

const claim = (over: Partial<Claim["take"]> = {}, source: Claim["source"] = null): Claim => ({
  take: { id: "t1", org_id: "o", project_id: "p", shot_id: "s", provider: "aurastage-sketch", model: "sketch-v1", capability: "image", params: { aspect_ratio: "16:9" }, seed: 4, ...over },
  package: { technical: { aspect_ratio: "16:9" } } as Claim["package"],
  source,
});

function deps(c: Claim | null, generate: (req: any) => Promise<any>) {
  const log: string[] = [];
  const d: WorkerDeps & { log_: string[]; stored: Record<string, Uint8Array> } = {
    log_: log,
    stored: {},
    claim: async () => c,
    complete: async (id, key, mt, req) => void log.push(`complete ${id} ${key} ${mt} ${req}`),
    fail: async (id, err, req) => void log.push(`fail ${id} ${err} ${req}`),
    gateway: { getAdapter: (id) => (id === "missing" ? undefined : { generate }) },
    storage: {
      put: async (k, b) => void (d.stored[k] = b),
      get: async () => ({ bytes: new Uint8Array([5]), contentType: "image/png" }),
      keyFor: (t, mt) => `${t.org_id}/${t.project_id}/takes/${t.shot_id}/${t.id}.${mt.includes("svg") ? "svg" : "bin"}`,
    },
    env: {},
    log: (e) => void log.push(e),
  };
  return d;
}

describe("generation worker", () => {
  it("idles when nothing is queued", async () => {
    expect(await runOnce(deps(null, async () => ({})))).toBe(false);
  });

  it("generates through the gateway, stores the media, then completes the take", async () => {
    let seen: any;
    const d = deps(claim(), async (req) => ((seen = req), { bytes: new Uint8Array([1]), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 }));
    expect(await runOnce(d)).toBe(true);
    expect(seen).toMatchObject({ capability: "image", model: "sketch-v1", aspect_ratio: "16:9", seed: 4, source_image: null });
    expect(Object.keys(d.stored)).toEqual(["o/p/takes/s/t1.svg"]);
    expect(d.log_).toContain("complete t1 o/p/takes/s/t1.svg image/svg+xml null");
  });

  it("passes the stored start frame to video generation", async () => {
    let seen: any;
    const d = deps(claim({ capability: "video", provider: "runway", model: "gen4_turbo" }, { storage_key: "k", media_type: "image/png" }), async (req) => (
      (seen = req), { bytes: new Uint8Array([2]), media_type: "video/mp4", provider_request_id: "task", cost_usd: null }
    ));
    await runOnce(d);
    expect(seen.source_image).toEqual({ bytes: new Uint8Array([5]), media_type: "image/png" });
  });

  it("records provider failures on the take (with the request id) instead of crashing", async () => {
    const d = deps(claim(), async () => {
      throw Object.assign(new Error("Runway failed: Content moderation"), { provider_request_id: "task-9" });
    });
    expect(await runOnce(d)).toBe(true);
    expect(d.log_).toContain("fail t1 Runway failed: Content moderation task-9");
    expect(Object.keys(d.stored)).toEqual([]);
  });

  it("fails clearly for an unknown provider", async () => {
    const d = deps(claim({ provider: "missing" }), async () => ({}));
    await runOnce(d);
    expect(d.log_.some((l) => l.startsWith("fail t1 Unknown provider missing"))).toBe(true);
  });
});
