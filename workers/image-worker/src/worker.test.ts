import { describe, expect, it } from "vitest";
import { runOnce, type Claim, type WorkerDeps } from "./worker";
import { chooseReferences } from "../../../apps/api/src/providers/references";

const claim = (over: Partial<Claim["take"]> = {}, source: Claim["source"] = null): Claim => ({
  take: { id: "t1", org_id: "o", project_id: "p", shot_id: "s", provider: "aurastage-sketch", model: "sketch-v1", capability: "image", params: { aspect_ratio: "16:9" }, seed: 4, ...over },
  package: { technical: { aspect_ratio: "16:9" } } as Claim["package"],
  source,
});

function deps(c: Claim | null, generate: (req: any) => Promise<any>, references?: unknown) {
  const log: string[] = [];
  const d: WorkerDeps & { log_: string[]; stored: Record<string, Uint8Array>; noted: any[] } = {
    log_: log,
    stored: {},
    noted: [],
    claim: async () => c,
    complete: async (id, key, mt, req) => void log.push(`complete ${id} ${key} ${mt} ${req}`),
    fail: async (id, err, req) => void log.push(`fail ${id} ${err} ${req}`),
    noteReferences: async (_id, refs) => void d.noted.push(refs),
    gateway: { getAdapter: (id) => (id === "missing" ? undefined : { name: id, references, generate }), chooseReferences },
    storage: {
      put: async (k, b) => void (d.stored[k] = b),
      get: async (k) => {
        if (k === "gone.png") throw new Error("not found");
        return { bytes: new Uint8Array([k.startsWith("refs/") ? 9 : 5]), contentType: "image/png" };
      },
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
    expect(seen.source_image).toEqual({ bytes: new Uint8Array([5]), media_type: "image/png", url: null });
  });

  it("gives providers that fetch by URL a short-lived signed link to the start frame", async () => {
    let seen: any;
    const d = deps(claim({ capability: "video", provider: "luma", model: "ray-2" }, { storage_key: "k", media_type: "image/png" }), async (req) => (
      (seen = req), { bytes: new Uint8Array([2]), media_type: "video/mp4", provider_request_id: "g", cost_usd: null }
    ));
    d.storage.signedUrl = async (k) => `https://media.example/${k}?sig=1`;
    await runOnce(d);
    expect(seen.source_image.url).toBe("https://media.example/k?sig=1");
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

  describe("reference images", () => {
    const ids = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
    const asset = (path: string | null, media_type = "image/png") => ({ storage_path: path, media_type, size_bytes: 1000, version: 2 });
    const refs = (): NonNullable<Claim["references"]> => [
      { kind: "prop", object_id: ids(1), name: "knife", view: "hero", asset_id: ids(2), asset: asset("refs/knife.png") },
      { kind: "location", object_id: ids(3), name: "HARBOUR", view: "wide:NIGHT", asset_id: ids(4), asset: asset("refs/harbour.png") },
      { kind: "character", object_id: ids(5), name: "Amara", view: "front:MCU", asset_id: ids(6), asset: asset("refs/amara.png") },
      { kind: "character", object_id: ids(7), name: "Tunde", view: "front:MCU", asset_id: ids(8), asset: asset("refs/tunde.svg", "image/svg+xml") },
      { kind: "character", object_id: ids(9), name: "Bisi", view: "front:MCU", asset_id: ids(1), asset: asset("gone.png") },
    ];
    const support = { image: { max: 2, media_types: ["image/png"], max_bytes: 5_000_000 } };

    it("sends what the provider accepts (characters first, then the place) and records every decision on the take", async () => {
      let seen: any;
      const c = { ...claim({ provider: "runway", model: "gen4_image" }), references: refs() };
      const d = deps(c, async (req) => ((seen = req), { bytes: new Uint8Array([1]), media_type: "image/png", provider_request_id: "r", cost_usd: null }), support);
      await runOnce(d);
      // Amara (character) and the harbour (location) fit the limit of 2; Tunde's view is a sketch; Bisi's file is gone.
      expect(seen.reference_images.map((r: any) => [r.kind, r.name, [...r.bytes]])).toEqual([["character", "Amara", [9]], ["location", "HARBOUR", [9]]]);
      const noted = d.noted[0] as any[];
      expect(noted.map((r) => [r.name, r.sent, r.asset_version])).toEqual([
        ["Amara", true, 2], ["Tunde", false, 2], ["Bisi", false, 2], ["HARBOUR", true, 2], ["knife", false, 2],
      ]);
      expect(noted.find((r) => r.name === "Tunde").reason).toMatch(/built-in sketch/);
      expect(noted.find((r) => r.name === "knife").reason).toMatch(/at most 2/);
      expect(d.log_.some((l) => l.startsWith("complete t1"))).toBe(true);
    });

    it("a reference file that can't be read is reported, and the take still generates", async () => {
      let seen: any;
      const only = refs().filter((r) => r.name === "Bisi");
      const d = deps({ ...claim({ provider: "runway" }), references: only }, async (req) => ((seen = req), { bytes: new Uint8Array([1]), media_type: "image/png", provider_request_id: null, cost_usd: null }), support);
      await runOnce(d);
      expect(seen.reference_images).toEqual([]);
      expect(d.noted[0][0]).toMatchObject({ name: "Bisi", sent: false, reason: expect.stringMatching(/couldn't be read/) });
      expect(d.log_.some((l) => l.startsWith("complete t1"))).toBe(true);
    });

    it("the built-in sketch gets none, and says why", async () => {
      let seen: any;
      const d = deps({ ...claim(), references: refs() }, async (req) => ((seen = req), { bytes: new Uint8Array([1]), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 }));
      await runOnce(d);
      expect(seen.reference_images).toEqual([]);
      expect(d.noted[0].every((r: any) => !r.sent && /prompt only/.test(r.reason))).toBe(true);
    });

    it("no references in the package: nothing is noted", async () => {
      const d = deps(claim(), async () => ({ bytes: new Uint8Array([1]), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 }));
      await runOnce(d);
      expect(d.noted).toEqual([]);
    });
  });
});
