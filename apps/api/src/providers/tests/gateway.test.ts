import { describe, expect, it } from "vitest";
import { getAdapter, providerStatuses, renderSketch } from "../index";
import type { GenerateRequest } from "../types";
import { ProviderError } from "../types";

const pkg = {
  project: { title: "Shadows of Lagos", genre: "Thriller", tone: null, setting: null, time_period: null },
  scene: { number: 2, heading: "EXT. HARBOUR - NIGHT", location: "HARBOUR", int_ext: "EXT", time_of_day: "NIGHT", purpose: null, mood: [], weather: null, atmosphere: null },
  camera: { size: "CU", size_label: "close-up", angle: "low", movement: "static", lens_mm: 85, focus: "shallow", composition: null, duration_seconds: 3 },
  characters: [{ id: "11111111-1111-4111-8111-111111111111", name: "Amara <Bello>", description: null, age: null, wardrobe: null }],
  performance: { action: "Amara turns & looks at Tunde.", dialogue: [] },
  lighting: null,
  technical: { aspect_ratio: "16:9" as const },
  negative: ["no on-screen text or subtitles"],
  prompt: "Cinematic film still, close-up.",
  provenance: {
    shot_id: "22222222-2222-4222-8222-222222222222", shot_plan_version_id: "33333333-3333-4333-8333-333333333333",
    scene_dna_version_id: "44444444-4444-4444-8444-444444444444", script_version_id: null, character_ids: [], dialogue_line_ids: [],
  },
  checks: [],
};
const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  capability: "image", model: "x", package: pkg, aspect_ratio: "16:9", duration_seconds: null, seed: 3, source_image: null, ...over,
});

type Call = { url: string; init?: RequestInit };
function fakeFetch(responses: ((url: string) => Response | undefined)[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const r of responses) {
      const res = r(url);
      if (res) return res;
    }
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Provider Gateway", () => {
  it("reports status from evidence only: key present or not, plus the last real result", () => {
    const s = providerStatuses({ RUNWAY_API_KEY: "k" }, { runway: { status: "failed", at: "2026-09-28T00:00:00Z", message: "quota" } });
    expect(s.map((x) => [x.id, x.state]).slice(0, 3)).toEqual([["aurastage-sketch", "configured"], ["runway", "configured"], ["openai", "not_configured"]]);
    expect(s.filter((x) => x.state === "configured").map((x) => x.id)).toEqual(["aurastage-sketch", "runway"]);
    expect(s[1].last_result).toMatchObject({ status: "failed", message: "quota" });
  });

  it("sketch: deterministic, labelled as a sketch, text escaped", async () => {
    const a = renderSketch(req());
    expect(a).toBe(renderSketch(req()));
    expect(a).toContain("AURASTAGE SKETCH · Scene 2 · close-up · 85mm · 3s");
    expect(a).toContain("Amara turns &amp; looks at Tunde.");
    expect(a).toContain("Amara &lt;Bello&gt;");
    const r = await getAdapter("aurastage-sketch")!.generate(req(), {});
    expect(r).toMatchObject({ media_type: "image/svg+xml", cost_usd: 0 });
  });

  it("runway image: sends the compiled prompt + ratio + seed, polls the task, downloads the result", async () => {
    const { f, calls } = fakeFetch([
      (u) => (u.endsWith("/text_to_image") ? json({ id: "task-1" }) : undefined),
      (u) => (u.endsWith("/tasks/task-1") ? json({ status: "SUCCEEDED", output: ["https://cdn.example/frame.png"] }) : undefined),
      (u) => (u === "https://cdn.example/frame.png" ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }) : undefined),
    ]);
    const r = await getAdapter("runway")!.generate(req({ model: "gen4_image" }), { RUNWAY_API_KEY: "secret" }, { fetchImpl: f, pollMs: 1 });
    expect(r).toMatchObject({ media_type: "image/png", provider_request_id: "task-1", cost_usd: null });
    expect([...r.bytes]).toEqual([1, 2, 3]);
    const body = JSON.parse(String(calls[0].init!.body));
    expect(body).toMatchObject({ model: "gen4_image", ratio: "1920:1080", seed: 3 });
    expect(body.promptText).toContain("Cinematic film still, close-up. Avoid: no on-screen text or subtitles.");
    expect((calls[0].init!.headers as Record<string, string>)["X-Runway-Version"]).toBe("2024-11-06");
  });

  it("runway: a failed task becomes a clear error with the request id", async () => {
    const { f } = fakeFetch([
      (u) => (u.endsWith("/text_to_image") ? json({ id: "task-2" }) : undefined),
      (u) => (u.endsWith("/tasks/task-2") ? json({ status: "FAILED", failure: "Content moderation" }) : undefined),
    ]);
    await expect(getAdapter("runway")!.generate(req({ model: "gen4_image" }), { RUNWAY_API_KEY: "s" }, { fetchImpl: f, pollMs: 1 })).rejects.toMatchObject({
      message: "Runway failed: Content moderation",
      provider_request_id: "task-2",
    });
  });

  it("runway video needs a start frame; missing keys never call out", async () => {
    const { f, calls } = fakeFetch([]);
    await expect(getAdapter("runway")!.generate(req({ capability: "video", model: "gen4_turbo" }), { RUNWAY_API_KEY: "s" }, { fetchImpl: f })).rejects.toBeInstanceOf(ProviderError);
    await expect(getAdapter("runway")!.generate(req(), {}, { fetchImpl: f })).rejects.toThrow(/not connected/);
    await expect(getAdapter("openai")!.generate(req(), {}, { fetchImpl: f })).rejects.toThrow(/not connected/);
    expect(calls).toHaveLength(0);
  });

  it("runway video: sends the start frame as a data URI with a supported duration", async () => {
    const { f, calls } = fakeFetch([
      (u) => (u.endsWith("/image_to_video") ? json({ id: "v1" }) : undefined),
      (u) => (u.endsWith("/tasks/v1") ? json({ status: "SUCCEEDED", output: ["https://cdn.example/v.mp4"] }) : undefined),
      (u) => (u.endsWith("v.mp4") ? new Response(new Uint8Array([9]), { headers: { "content-type": "video/mp4" } }) : undefined),
    ]);
    const r = await getAdapter("runway")!.generate(
      req({ capability: "video", model: "gen4_turbo", duration_seconds: 7, source_image: { bytes: new Uint8Array([1]), media_type: "image/png" } }),
      { RUNWAY_API_KEY: "s" },
      { fetchImpl: f, pollMs: 1 }
    );
    expect(r.media_type).toBe("video/mp4");
    const body = JSON.parse(String(calls[0].init!.body));
    expect(body).toMatchObject({ model: "gen4_turbo", ratio: "1280:720", duration: 10, promptImage: "data:image/png;base64,AQ==" });
  });

  it("openai image: decodes the returned image and keeps the request id", async () => {
    const { f, calls } = fakeFetch([
      (u) => (u.includes("images/generations") ? json({ data: [{ b64_json: Buffer.from([7, 7]).toString("base64") }] }, 200, { "x-request-id": "req_9" }) : undefined),
    ]);
    const r = await getAdapter("openai")!.generate(req({ model: "gpt-image-1" }), { OPENAI_API_KEY: "s" }, { fetchImpl: f });
    expect([...r.bytes]).toEqual([7, 7]);
    expect(r.provider_request_id).toBe("req_9");
    expect(JSON.parse(String(calls[0].init!.body))).toMatchObject({ model: "gpt-image-1", size: "1536x1024", n: 1 });
  });

  describe("reference images", () => {
    const png = (n: number) => new Uint8Array([137, 80, 78, 71, n]);
    const refs = [
      { kind: "character" as const, name: "Amara", view: "front:MCU", bytes: png(1), media_type: "image/png" },
      { kind: "character" as const, name: "Tunde", view: "front:MCU", bytes: png(2), media_type: "image/png" },
      { kind: "location" as const, name: "HARBOUR", view: "wide:NIGHT", bytes: png(3), media_type: "image/jpeg" },
    ];

    it("runway image: sends tagged references and names them in the prompt (kept within 1000 characters)", async () => {
      const { f, calls } = fakeFetch([
        (u) => (u.endsWith("/text_to_image") ? json({ id: "task-r" }) : undefined),
        (u) => (u.endsWith("/tasks/task-r") ? json({ status: "SUCCEEDED", output: ["https://cdn.example/r.png"] }) : undefined),
        (u) => (u === "https://cdn.example/r.png" ? new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }) : undefined),
      ]);
      const long = { ...pkg, prompt: "x".repeat(2000) };
      await getAdapter("runway")!.generate(req({ model: "gen4_image", package: long, reference_images: refs }), { RUNWAY_API_KEY: "s" }, { fetchImpl: f, pollMs: 1 });
      const body = JSON.parse(String(calls[0].init!.body));
      expect(body.referenceImages.map((r: { tag: string }) => r.tag)).toEqual(["char1", "char2", "place"]);
      expect(body.referenceImages[2].uri).toBe(`data:image/jpeg;base64,${Buffer.from(png(3)).toString("base64")}`);
      expect(body.promptText.startsWith("Keep these consistent with the reference images: @char1 is Amara; @char2 is Tunde; @place is the location (HARBOUR).")).toBe(true);
      expect(body.promptText.length).toBeLessThanOrEqual(1000);
    });

    it("runway video: no reference field (it starts from the approved frame)", async () => {
      const { f, calls } = fakeFetch([
        (u) => (u.endsWith("/image_to_video") ? json({ id: "task-v" }) : undefined),
        (u) => (u.endsWith("/tasks/task-v") ? json({ status: "SUCCEEDED", output: ["https://cdn.example/v.mp4"] }) : undefined),
        (u) => (u === "https://cdn.example/v.mp4" ? new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } }) : undefined),
      ]);
      await getAdapter("runway")!.generate(
        req({ capability: "video", model: "gen4_turbo", source_image: { bytes: png(9), media_type: "image/png" }, reference_images: refs }),
        { RUNWAY_API_KEY: "s" }, { fetchImpl: f, pollMs: 1 });
      const body = JSON.parse(String(calls[0].init!.body));
      expect(body.referenceImages).toBeUndefined();
      expect(body.promptText).not.toContain("@char1");
    });

    it("openai image with references: uses the edits endpoint with every reference as an input image", async () => {
      const { f, calls } = fakeFetch([(u) => (u.endsWith("/images/edits") ? json({ data: [{ b64_json: Buffer.from([4]).toString("base64") }] }) : undefined)]);
      const r = await getAdapter("openai")!.generate(req({ model: "gpt-image-1", reference_images: refs }), { OPENAI_API_KEY: "s" }, { fetchImpl: f });
      expect([...r.bytes]).toEqual([4]);
      const form = calls[0].init!.body as FormData;
      expect(form.get("model")).toBe("gpt-image-1");
      expect(String(form.get("prompt"))).toMatch(/^Keep these consistent with the reference images: reference image 1 is Amara; reference image 2 is Tunde; reference image 3 is the location \(HARBOUR\)\. Cinematic film still/);
      const images = form.getAll("image[]") as File[];
      expect(images.map((i) => [i.name, i.type])).toEqual([["reference-1.png", "image/png"], ["reference-2.png", "image/png"], ["reference-3.jpg", "image/jpeg"]]);
      expect([...new Uint8Array(await images[2].arrayBuffer())]).toEqual([...png(3)]);
    });

    it("the adapters declare what they accept; the sketch declares nothing", () => {
      expect(getAdapter("runway")!.references?.image?.max).toBe(3);
      expect(getAdapter("runway")!.references?.video).toBeUndefined();
      expect(getAdapter("openai")!.references?.image?.max).toBe(6);
      expect(getAdapter("aurastage-sketch")!.references).toBeUndefined();
    });
  });
});
