import { describe, expect, it } from "vitest";
import { sketchAdapter } from "../sketch/sketchAdapter";
import { openaiImageAdapter } from "../image/openai/openaiImageAdapter";

const req = { model: "sketch-v1", prompt: "Character reference sheet image… Amara Bello — Woman, aged 32.", negative: ["a different person"], aspect_ratio: "9:16" as const, seed: 1,
  sketch: { title: "Amara Bello", subtitle: "Front · Full", angle: "front" as const, size: "FULL" as const, lines: ["Amara Bello — Woman, aged 32."] } };

describe("still images from a prompt (character references)", () => {
  it("the built-in sketch draws a labelled, honest placeholder at the view's frame shape", async () => {
    const r = await sketchAdapter.generateStill!(req, {});
    const svg = new TextDecoder().decode(r.bytes);
    expect(r).toMatchObject({ media_type: "image/svg+xml", cost_usd: 0 });
    expect(svg).toContain('viewBox="0 0 720 1280"');
    expect(svg).toContain("Amara Bello");
    expect(svg).toContain("AURASTAGE SKETCH (not AI)");
  });
  it("OpenAI gets the full prompt with what to avoid, at a portrait size for full-length views; no key = plain refusal", async () => {
    let body: any;
    const fetchImpl = (async (_u: string, init: any) => ((body = JSON.parse(init.body)), new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }), { status: 200 }))) as typeof fetch;
    const r = await openaiImageAdapter.generateStill!({ ...req, model: "gpt-image-1" }, { OPENAI_API_KEY: "k" }, { fetchImpl });
    expect(body).toMatchObject({ model: "gpt-image-1", size: "1024x1536" });
    expect(body.prompt).toBe("Character reference sheet image… Amara Bello — Woman, aged 32. Avoid: a different person.");
    expect(r.media_type).toBe("image/png");
    await expect(openaiImageAdapter.generateStill!({ ...req, model: "gpt-image-1" }, {})).rejects.toThrow(/not connected/);
  });
});
