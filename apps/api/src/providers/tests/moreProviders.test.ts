// The other generation providers behind the Provider Gateway (Google, Stability, FLUX, Luma, Kling, MiniMax), exercised
// with a fake network: the right endpoint, the key only in headers, the approved frame / references sent, results downloaded.
import { describe, expect, it } from "vitest";
import { getAdapter, providerStatuses } from "../index";
import { klingToken } from "../video/kling/klingAdapter";
import type { GenerateRequest } from "../types";

const pkg = {
  project: { title: "Shadows of Lagos", genre: "Thriller", tone: null, setting: null, time_period: null },
  scene: { number: 2, heading: "EXT. HARBOUR - NIGHT", location: "HARBOUR", int_ext: "EXT", time_of_day: "NIGHT", purpose: null, mood: [], weather: null, atmosphere: null },
  camera: { size: "CU", size_label: "close-up", angle: "low", movement: "static", lens_mm: 85, focus: "shallow", composition: null, duration_seconds: 3 },
  characters: [], performance: { action: "Amara turns.", dialogue: [] }, lighting: null, technical: { aspect_ratio: "16:9" as const },
  negative: ["no on-screen text"], prompt: "Cinematic film still, close-up.",
  provenance: { shot_id: "22222222-2222-4222-8222-222222222222", shot_plan_version_id: "33333333-3333-4333-8333-333333333333",
    scene_dna_version_id: "44444444-4444-4444-8444-444444444444", script_version_id: null, character_ids: [], dialogue_line_ids: [] },
  checks: [],
};
const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({ capability: "image", model: "x", package: pkg as never, aspect_ratio: "16:9", duration_seconds: null, seed: 3, source_image: null, ...over });
const png = new Uint8Array([137, 80, 78, 71]);
const frame = { bytes: png, media_type: "image/png", url: "https://signed.example/frame.png" };
const ref = { bytes: png, media_type: "image/png", kind: "character" as const, label: "Amara", url: "https://signed.example/amara.png" };

type Call = { url: string; init?: RequestInit };
function net(routes: [RegExp, () => Response][]) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = routes.find(([re]) => re.test(url));
    if (!r) throw new Error("unexpected " + url);
    return r[1]();
  }) as unknown as typeof fetch;
  return { f, calls, body: (i: number) => JSON.parse(String(calls[i].init?.body)) };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const media = (type: string) => new Response(png, { headers: { "content-type": type } });

describe("more generation providers", () => {
  it("each is listed, and configured only by its own key", () => {
    const env = { GEMINI_API_KEY: "g", STABILITY_API_KEY: "s", BFL_API_KEY: "b", LUMA_API_KEY: "l", KLING_ACCESS_KEY: "a", KLING_SECRET_KEY: "k", MINIMAX_API_KEY: "m" };
    const s = providerStatuses(env);
    expect(s.filter((p) => p.state === "configured").map((p) => p.id)).toEqual(["aurastage-sketch", "google", "stability", "bfl", "luma", "kling", "minimax"]);
    expect(providerStatuses({ KLING_ACCESS_KEY: "a" }).find((p) => p.id === "kling")!.state).toBe("not_configured");
    expect(s.find((p) => p.id === "runway")!.video_needs_frame).toBe(true);
    expect(s.find((p) => p.id === "luma")!.video_needs_frame).toBe(false);
  });

  it("google imagen: predict with the ratio, key in a header only", async () => {
    const n = net([[/:predict$/, () => json({ predictions: [{ bytesBase64Encoded: Buffer.from(png).toString("base64"), mimeType: "image/png" }] })]]);
    const r = await getAdapter("google")!.generate(req({ model: "imagen-4.0-generate-001" }), { GEMINI_API_KEY: "secret" }, { fetchImpl: n.f });
    expect(n.calls[0].url).toContain("/models/imagen-4.0-generate-001:predict");
    expect(n.calls[0].url).not.toContain("secret");
    expect((n.calls[0].init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    expect(n.body(0).parameters.aspectRatio).toBe("16:9");
    expect(r.media_type).toBe("image/png");
  });

  it("google gemini image sends reference images inline; veo animates the approved frame", async () => {
    const n = net([
      [/:generateContent$/, () => json({ responseId: "r1", candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(png).toString("base64") } }] } }] })],
      [/:predictLongRunning$/, () => json({ name: "models/veo/operations/op1" })],
      [/operations\/op1$/, () => json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://g.example/v.mp4" } }] } } })],
      [/v\.mp4$/, () => media("video/mp4")],
    ]);
    const g = getAdapter("google")!;
    const r = await g.generate(req({ model: "gemini-2.5-flash-image", reference_images: [ref] }), { GEMINI_API_KEY: "k" }, { fetchImpl: n.f });
    expect(n.body(0).contents[0].parts[1].inline_data.mime_type).toBe("image/png");
    expect(n.body(0).contents[0].parts[0].text).toMatch(/reference image 1/);
    expect(r.provider_request_id).toBe("r1");
    const v = await g.generate(req({ capability: "video", model: "veo-3.0-generate-001", source_image: frame }), { GEMINI_API_KEY: "k" }, { fetchImpl: n.f, pollMs: 1 });
    expect(n.body(1).instances[0].image.mimeType).toBe("image/png");
    expect(v).toMatchObject({ media_type: "video/mp4", provider_request_id: "models/veo/operations/op1" });
  });

  it("stability: multipart with negative prompt; a 402 says the account needs credit", async () => {
    const ok = net([[/\/ultra$/, () => media("image/png")]]);
    await getAdapter("stability")!.generate(req({ model: "stable-image-ultra" }), { STABILITY_API_KEY: "s" }, { fetchImpl: ok.f });
    const form = ok.calls[0].init!.body as FormData;
    expect(form.get("negative_prompt")).toBe("no on-screen text");
    expect(form.get("aspect_ratio")).toBe("16:9");
    const broke = net([[/\/core$/, () => json({ errors: ["insufficient credits"] }, 402)]]);
    await expect(getAdapter("stability")!.generate(req({ model: "stable-image-core" }), { STABILITY_API_KEY: "s" }, { fetchImpl: broke.f })).rejects.toThrow(/needs credit/);
  });

  it("flux kontext sends the character reference as its input image and polls the task", async () => {
    const n = net([
      [/\/v1\/flux-kontext-pro$/, () => json({ id: "b1", polling_url: "https://api.bfl.ai/v1/get_result?id=b1" })],
      [/get_result/, () => json({ status: "Ready", result: { sample: "https://bfl.example/out.png" } })],
      [/out\.png$/, () => media("image/png")],
    ]);
    const r = await getAdapter("bfl")!.generate(req({ model: "flux-kontext-pro", reference_images: [ref] }), { BFL_API_KEY: "b" }, { fetchImpl: n.f, pollMs: 1 });
    expect(n.body(0).input_image).toBe(Buffer.from(png).toString("base64"));
    expect((n.calls[0].init!.headers as Record<string, string>)["x-key"]).toBe("b");
    expect(r.provider_request_id).toBe("b1");
  });

  it("luma: video starts from the approved frame's signed link; photon passes reference links", async () => {
    const n = net([
      [/\/generations(\/image)?$/, () => json({ id: "l1" })],
      [/\/generations\/l1$/, () => json({ state: "completed", assets: { video: "https://luma.example/v.mp4", image: "https://luma.example/i.jpg" } })],
      [/luma\.example/, () => media("video/mp4")],
    ]);
    const a = getAdapter("luma")!;
    await a.generate(req({ capability: "video", model: "ray-2", source_image: frame }), { LUMA_API_KEY: "l" }, { fetchImpl: n.f, pollMs: 1 });
    expect(n.body(0).keyframes.frame0).toEqual({ type: "image", url: frame.url });
    await a.generate(req({ model: "photon-1", reference_images: [ref] }), { LUMA_API_KEY: "l" }, { fetchImpl: n.f, pollMs: 1 });
    const photon = n.calls.findIndex((c) => c.url.endsWith("/generations/image"));
    expect(n.body(photon).image_ref).toEqual([{ url: ref.url, weight: 0.85 }]);
  });

  it("kling: signs each call with a JWT from the access/secret keys and uses image2video for the frame", async () => {
    const t = klingToken("ak", "sk", 1000).split(".");
    expect(JSON.parse(Buffer.from(t[1], "base64url").toString())).toEqual({ iss: "ak", exp: 2800, nbf: 995 });
    const n = net([
      [/\/v1\/videos\/image2video$/, () => json({ code: 0, data: { task_id: "k1" } })],
      [/\/image2video\/k1$/, () => json({ code: 0, data: { task_status: "succeed", task_result: { videos: [{ url: "https://kling.example/v.mp4" }] } } })],
      [/kling\.example/, () => media("video/mp4")],
    ]);
    const r = await getAdapter("kling")!.generate(req({ capability: "video", model: "kling-v2-1", source_image: frame }), { KLING_ACCESS_KEY: "ak", KLING_SECRET_KEY: "sk" }, { fetchImpl: n.f, pollMs: 1 });
    expect((n.calls[0].init!.headers as Record<string, string>).Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(n.body(0).image).toBe(Buffer.from(png).toString("base64"));
    expect(r.provider_request_id).toBe("k1");
  });

  it("minimax: text-to-video, then file retrieval; a failed task says why", async () => {
    const n = net([
      [/\/v1\/video_generation$/, () => json({ task_id: "m1", base_resp: { status_code: 0 } })],
      [/query\/video_generation/, () => json({ status: "Success", file_id: "f1" })],
      [/files\/retrieve/, () => json({ file: { download_url: "https://mm.example/v.mp4" } })],
      [/mm\.example/, () => media("video/mp4")],
    ]);
    const r = await getAdapter("minimax")!.generate(req({ capability: "video", model: "MiniMax-Hailuo-02", duration_seconds: 8 }), { MINIMAX_API_KEY: "m" }, { fetchImpl: n.f, pollMs: 1 });
    expect(n.body(0)).toMatchObject({ model: "MiniMax-Hailuo-02", duration: 10 });
    expect(r.media_type).toBe("video/mp4");
    const bad = net([[/\/v1\/video_generation$/, () => json({ task_id: "m2" })], [/query/, () => json({ status: "Fail", base_resp: { status_msg: "sensitive content" } })]]);
    await expect(getAdapter("minimax")!.generate(req({ capability: "video", model: "MiniMax-Hailuo-02" }), { MINIMAX_API_KEY: "m" }, { fetchImpl: bad.f, pollMs: 1 })).rejects.toThrow(/sensitive content/);
  });

  it("video-only providers refuse stills, and every provider refuses without its key", async () => {
    await expect(getAdapter("kling")!.generate(req(), { KLING_ACCESS_KEY: "a", KLING_SECRET_KEY: "b" })).rejects.toThrow(/makes video/);
    for (const id of ["google", "stability", "bfl", "luma", "kling", "minimax"]) {
      await expect(getAdapter(id)!.generate(req({ capability: id === "kling" || id === "minimax" ? "video" : "image", model: "m" }), {})).rejects.toThrow(/not connected/);
    }
  });
});
