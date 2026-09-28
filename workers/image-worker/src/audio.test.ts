import { describe, expect, it } from "vitest";
import { audioOnce, type AudioClaim, type AudioDeps } from "./audio";

const claim: AudioClaim = { id: "g1", org_id: "o", project_id: "p", kind: "fx", description: "door slams", duration_seconds: "2", mood: [], provider: "aurastage-synth", model: "synth-1", seed: 4, params: {} };
function deps(c: AudioClaim | null, adapter?: AudioDeps["getAudioAdapter"] extends (id: string) => infer A ? A : never) {
  const log: string[] = [];
  const stored: Record<string, Uint8Array> = {};
  let seen: any;
  const d: AudioDeps & { log_: string[]; stored: typeof stored; seen: () => any } = {
    log_: log, stored, seen: () => seen,
    claim: async () => c,
    complete: async (id, key, sum, meta, result, req, cost) => (log.push(`complete ${id} ${key.replace(/[0-9a-f-]{36}/, "X")} ${sum.length} ${JSON.stringify(meta)} ${JSON.stringify(result.layers)} ${req} ${cost}`), "asset-1"),
    fail: async (id, err) => void log.push(`fail ${id} ${err}`),
    getAudioAdapter: () => adapter && { generate: (r, env) => ((seen = r), adapter.generate(r, env)) },
    put: async (k, b) => void (stored[k] = b),
    env: {},
    log: (e) => void log.push(e),
  };
  return d;
}

describe("audio generation worker", () => {
  it("idles when nothing is queued", async () => {
    expect(await audioOnce(deps(null))).toBe(false);
  });
  it("generates through the gateway, stores privately under the project, and completes with provenance", async () => {
    const d = deps(claim, { generate: async () => ({ bytes: new Uint8Array([1, 2, 3]), media_type: "audio/wav", duration_seconds: 2, sample_rate: 48000, channels: 2, detail: { layers: [{ name: "door slam" }] }, provider_request_id: null, cost_usd: 0 }) });
    await audioOnce(d);
    expect(d.seen()).toMatchObject({ kind: "fx", description: "door slams", duration_seconds: 2, seed: 4 });
    expect(Object.keys(d.stored)[0]).toMatch(/^o\/p\/assets\/[0-9a-f-]{36}\.wav$/);
    expect(d.log_.find((l) => l.startsWith("complete"))).toBe('complete g1 o/p/assets/X.wav 64 {"media_type":"audio/wav","size_bytes":3,"duration_seconds":2,"sample_rate":48000,"channels":2} [{"name":"door slam"}] null 0');
  });
  it("records a failure plainly (unknown provider, provider error) — never a fake file", async () => {
    const d1 = deps(claim);
    await audioOnce(d1);
    expect(d1.log_[1]).toBe("fail g1 Unknown sound provider aurastage-synth");
    const d2 = deps(claim, { generate: async () => { throw new Error("Provider busy"); } });
    await audioOnce(d2);
    expect(d2.log_[1]).toBe("fail g1 Provider busy");
    expect(Object.keys(d2.stored)).toEqual([]);
  });
});
