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
    expect(svg).toContain("AURASKETCH (not AI)");
  });
  it("AuraSketch 2 draws the described person, not a placeholder head", async () => {
    const { characterAppearanceEngine } = await import("@aurastage/engines");
    const appearance = characterAppearanceEngine({ gender: "Woman", age: "32", description: "long braids, brown skin", wardrobe: "emerald green dress, gold gele" });
    const svg = new TextDecoder().decode((await sketchAdapter.generateStill!({ ...req, sketch: { ...req.sketch, appearance } }, {})).bytes);
    expect(svg).toContain("#6b4430"); // brown skin
    expect(svg).toContain("#3f7a45"); // green dress
    expect(svg).toContain("#c9a24a"); // gold gele
    // Without appearance facts (an older request) it reads the identity lines instead of drawing a blank figure.
    const old = new TextDecoder().decode((await sketchAdapter.generateStill!(req, {})).bytes);
    expect(old).toContain("<svg x=");
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

describe("AuraStage Sketch: location and prop views", () => {
  const svg = async (sketch: any, aspect: any) => new TextDecoder().decode((await sketchAdapter.generateStill!({ model: "sketch-v1", prompt: "p", negative: [], aspect_ratio: aspect, seed: 1, sketch }, {})).bytes);
  it("draws a location for its time of day, labelled not AI, and the same place always draws the same", async () => {
    const night = await svg({ kind: "location", title: "Lagos Harbour", subtitle: "Wide · Night", view: "wide", time: "NIGHT", int_ext: ["EXT"], lines: ["Lagos Harbour — exterior."] }, "16:9");
    const day = await svg({ kind: "location", title: "Lagos Harbour", subtitle: "Wide · Day", view: "wide", time: "DAY", int_ext: ["EXT"], lines: [] }, "16:9");
    expect(night).toContain('viewBox="0 0 1280 720"');
    // placeSketchEngine (2026-10-02): a harbour with water, night and day skies.
    expect(night).toContain("#060a16");
    expect(day).toContain("#5d86b3");
    expect(day).toContain("#3f6f8a"); // the water
    expect(night).toContain("Lagos Harbour");
    expect(night).toContain("AURASTAGE SKETCH (not AI)");
    expect(await svg({ kind: "location", title: "Lagos Harbour", subtitle: "Wide · Night", view: "wide", time: "NIGHT", int_ext: ["EXT"], lines: ["Lagos Harbour — exterior."] }, "16:9")).toBe(night);
    const room = await svg({ kind: "location", title: "Tunde's Flat", subtitle: "Wide · Night", view: "wide", time: "NIGHT", int_ext: ["INT"], lines: [] }, "16:9");
    // A lamp on at night indoors: its glow is drawn.
    expect(room).toMatch(/fill="url\(#glow\)" opacity/);
  });
  it("draws props and vehicles, with a hand or person for scale", async () => {
    const hand = await svg({ kind: "prop", title: "Notebook", subtitle: "In hand", view: "in_hand", category: "prop", lines: [] }, "1:1");
    const bus = await svg({ kind: "prop", title: "Danfo", subtitle: "Hero", view: "hero", category: "vehicle", lines: [] }, "16:9");
    expect(hand).toContain("#b9b3ad");
    expect(bus).toContain("#1f1e24"); // wheels
    expect(hand).toContain("Notebook");
  });
});
