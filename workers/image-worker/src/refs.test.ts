import { describe, expect, it } from "vitest";
import { refOnce, type RefClaim, type RefDeps } from "./refs";

const claim: RefClaim = { id: "r1", org_id: "o", project_id: "p", character_id: "c", angle: "front", size: "FULL", aspect_ratio: "9:16", prompt: "Amara…", negative: ["x"],
  provider: "aurastage-sketch", model: "sketch-v1", seed: 5, sketch: { title: "Amara Bello" } };
function deps(c: RefClaim | null, adapter?: any) {
  const log: string[] = [], stored: Record<string, Uint8Array> = {};
  let seen: any;
  const d: RefDeps & { log_: string[]; stored: typeof stored; seen: () => any } = {
    log_: log, stored, seen: () => seen,
    claim: async () => c,
    complete: async (id, key, sum, meta) => (log.push(`complete ${id} ${key.replace(/[0-9a-f-]{36}/, "X")} ${sum.length} ${JSON.stringify(meta)}`), "asset-1"),
    fail: async (id, e) => void log.push(`fail ${id} ${e}`),
    getAdapter: () => adapter && { generateStill: adapter.generateStill && ((r: any, env: any) => ((seen = r), adapter.generateStill(r, env))) },
    put: async (k, b) => void (stored[k] = b),
    env: {}, log: (e) => void log.push(e),
  };
  return d;
}

describe("character reference worker", () => {
  it("idles when nothing is queued", async () => expect(await refOnce(deps(null))).toBe(false));
  it("makes the still through the gateway with the prompt and sketch hints, stores it privately, completes with specs", async () => {
    const d = deps(claim, { generateStill: async () => ({ bytes: new Uint8Array([60, 115]), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 }) });
    await refOnce(d);
    expect(d.seen()).toMatchObject({ prompt: "Amara…", aspect_ratio: "9:16", seed: 5, sketch: { title: "Amara Bello" } });
    expect(Object.keys(d.stored)[0]).toMatch(/^o\/p\/assets\/[0-9a-f-]{36}\.svg$/);
    expect(d.log_[0]).toBe('complete r1 o/p/assets/X.svg 64 {"media_type":"image/svg+xml","size_bytes":2,"width":720,"height":1280}');
  });
  it("a backend that can't make stills, or a provider error, is recorded as a failure — never a fake image", async () => {
    const d1 = deps(claim, {});
    await refOnce(d1);
    expect(d1.log_[0]).toBe("fail r1 aurastage-sketch can't make reference images");
    const d2 = deps(claim, { generateStill: async () => { throw new Error("OpenAI refused the request (429)"); } });
    await refOnce(d2);
    expect(d2.log_[0]).toBe("fail r1 OpenAI refused the request (429)");
    expect(Object.keys(d2.stored)).toEqual([]);
  });
  it("location views (16:9, a view key) go through the same loop with the right size", async () => {
    const loc: RefClaim = { id: "w1", org_id: "o", project_id: "p", view_key: "wide:NIGHT", aspect_ratio: "16:9", prompt: "Harbour…", negative: [],
      provider: "aurastage-sketch", model: "sketch-v1", seed: 2, sketch: { kind: "location", title: "Lagos Harbour" } };
    const d = deps(loc, { generateStill: async () => ({ bytes: new Uint8Array([60]), media_type: "image/svg+xml", provider_request_id: null, cost_usd: 0 }) });
    await refOnce(d);
    expect(d.seen()).toMatchObject({ aspect_ratio: "16:9", sketch: { kind: "location" } });
    expect(d.log_[0]).toContain('"width":1280,"height":720');
    expect(d.log_[1]).toBe("ref.succeeded");
  });
});
