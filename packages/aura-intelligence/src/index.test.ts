import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyIntent, routeCapability, ToolRegistry, trimContext, validatePlan, buildPlannerPrompt, checkLite, planProblems, plannerToolSchemas, zodToJsonSchemaLite, type BackendDescriptor } from "./index";

const P = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";

describe("capability routing", () => {
  const backends: BackendDescriptor[] = [
    { id: "aurastage-sketch", name: "AuraStage Sketch", execution: "native", capabilities: ["STORYBOARD", "IMAGE_GENERATION"], configured: true },
    { id: "openai", name: "OpenAI", execution: "external", capabilities: ["IMAGE_GENERATION", "IMAGE_EDIT"], configured: false },
    { id: "test", name: "Test", execution: "test", capabilities: ["TEXT_REASONING"], configured: true },
  ];
  it("never routes to a backend without the capability or without its key", () => {
    expect(routeCapability(backends, "IMAGE_EDIT")).toBeNull();
    expect(routeCapability(backends, "VIDEO_GENERATION")).toBeNull();
  });
  it("prefers AuraStage native, falls back in order, and honours an explicit choice", () => {
    expect(routeCapability(backends, "IMAGE_GENERATION")?.id).toBe("aurastage-sketch");
    expect(routeCapability(backends, "TEXT_REASONING")?.id).toBe("test");
    expect(routeCapability(backends, "IMAGE_GENERATION", "external")).toBeNull();
    expect(routeCapability(backends, "IMAGE_GENERATION", "auto", "openai")).toBeNull();
  });
});

describe("intent pre-classifier", () => {
  it("reads the directive's example as a scene change touching Scene DNA, with the characters mentioned", () => {
    const i = classifyIntent({ module: "scene_dna", text: "Make this scene feel more threatening, change it to late evening and have Amara remain close to the doorway because she doesn't trust Daniel." });
    expect(i.operation).toBe("MODIFY_SCENE");
    expect(i.modules[0]).toBe("scene_dna");
    expect(i.mentions).toEqual(expect.arrayContaining(["Amara", "Daniel"]));
  });
  it("spots wardrobe, dialogue and questions", () => {
    expect(classifyIntent({ module: "casting", text: "Give Amara a more understated professional wardrobe" }).operation).toBe("CHANGE_WARDROBE");
    expect(classifyIntent({ module: "dialogue", text: "Daniel shouldn't admit what he knows directly" }).operation).toBe("MODIFY_DIALOGUE");
    expect(classifyIntent({ module: "script", text: "Why is act two so long?" }).operation).toBe("QUESTION");
    expect(classifyIntent({ module: "script", text: "xyzzy plugh" }).operation).toBe("UNSUPPORTED");
  });
});

describe("plan validation", () => {
  const registry = new ToolRegistry().register({
    name: "updateSceneDNA", module: "scene_dna", action: "edit", description: "Change scene fields", target: "scene",
    input: z.object({ scene_id: z.string().uuid(), mood: z.array(z.string()).optional(), weather: z.string().optional() }).strict(),
    impact: ["Storyboard & Shots", "Visual Generation"], undo: "version",
  });
  const plan = (calls: { tool: string; input_json: string; reason: string }[]) => ({ summary: "s", operation: "MODIFY_SCENE" as const, calls, not_possible: [], questions: [] });
  it("accepts registered tools with valid input and reports their impact and permission", () => {
    const r = validatePlan(plan([{ tool: "updateSceneDNA", input_json: JSON.stringify({ scene_id: S, weather: "thunderstorm" }), reason: "r" }]), registry, (m, a) => m === "scene_dna" && a === "edit");
    expect(r.issues).toEqual([]);
    expect(r.calls[0]).toMatchObject({ tool: "updateSceneDNA", input: { weather: "thunderstorm" }, allowed: true });
    expect(r.impact).toEqual(["Storyboard & Shots", "Visual Generation"]);
  });
  it("rejects unknown tools, bad JSON, extra fields and marks calls the user may not make", () => {
    const r = validatePlan(plan([
      { tool: "dropDatabase", input_json: "{}", reason: "" },
      { tool: "updateSceneDNA", input_json: "{not json", reason: "" },
      { tool: "updateSceneDNA", input_json: JSON.stringify({ scene_id: S, sql: "delete" }), reason: "" },
      { tool: "updateSceneDNA", input_json: JSON.stringify({ scene_id: S }), reason: "" },
    ]), registry, () => false);
    expect(r.issues.map((i) => i.problem)).toEqual(["No such tool", "Input isn't valid JSON", expect.stringMatching(/Unrecognized key/)]);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].allowed).toBe(false);
  });
  it("lists only the given tools, with their input schemas, in the planner prompt", () => {
    const text = buildPlannerPrompt({ project_id: P, module: "scene_dna", object: null, text: "Change it to night", mode: "suggest" },
      classifyIntent({ module: "scene_dna", text: "Change it to night" }), { project: { id: P, title: "Shadows", genre: null, tone: null }, module: "scene_dna", focus: null, items: [] }, registry.list());
    expect(text).toMatch(/updateSceneDNA \(scene_dna\)/);
    expect(text).toMatch(/"weather":\{"type":"string"/);
    expect(text).toMatch(/Request: Change it to night/);
  });
});

describe("tool limits in the planner (planner 1.1.0)", () => {
  const schema = z.object({ id: z.string().uuid(), changes: z.object({ accent: z.string().max(120).nullable(), intensity: z.number().int().min(1).max(10), mood: z.array(z.string()).max(3), kind: z.enum(["a", "b"]) }).partial().strict() }).strict();
  it("the schema shown to the model carries lengths, ranges, allowed values and unknown-key rules", () => {
    const lite = zodToJsonSchemaLite(schema) as any;
    expect(lite.required).toEqual(["id", "changes"]);
    expect(lite.properties.changes.properties.accent).toEqual({ type: "string", maxLength: 120, nullable: true });
    expect(lite.properties.changes.properties.intensity).toEqual({ type: "integer", minimum: 1, maximum: 10 });
    expect(lite.properties.changes.properties.mood.maxItems).toBe(3);
    expect(lite.properties.changes.additionalProperties).toBe(false);
  });
  it("checkLite finds what zod would refuse, in plain words", () => {
    const lite = zodToJsonSchemaLite(schema);
    const bad = { id: "x", changes: { accent: "y".repeat(121), intensity: 11, mood: ["a", "b", "c", "d"], kind: "c", extra: 1 } };
    expect(checkLite(lite, bad)).toEqual([
      "input.changes.accent: at most 120 characters (this is 121) — shorten it",
      "input.changes.intensity: at most 10",
      "input.changes.mood: at most 3 items",
      "input.changes.kind: must be one of a, b",
      "input.changes.extra: isn't a field of this tool — leave it out",
    ]);
    expect(checkLite(lite, { id: "x", changes: { accent: null, intensity: 4 } })).toEqual([]);
  });
  it("planProblems names the call and the tool", () => {
    const registry = new ToolRegistry().register({ name: "t", module: "casting", action: "edit", target: "character", description: "", input: schema, impact: [], undo: "inverse" } as any);
    const problems = planProblems({ summary: "s", operation: "MODIFY_CHARACTER", not_possible: [], questions: [],
      calls: [{ tool: "t", input_json: JSON.stringify({ id: "x", changes: { accent: "z".repeat(200) } }), reason: "" }, { tool: "nope", input_json: "{}", reason: "" }] } as any, plannerToolSchemas(registry.list()));
    expect(problems).toEqual(["call 1 (t): input.changes.accent: at most 120 characters (this is 200) — shorten it", "call 2 (nope): there is no such tool"]);
  });
});

describe("context budget", () => {
  it("keeps the focus object and mentioned objects first and trims oversized data", () => {
    const item = (id: string, label: string, size = 10) => ({ ref: { type: "character" as const, id, version: null, label }, data: { text: "x".repeat(size) } });
    const ids = Array.from({ length: 70 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const bundle = { project: { id: P, title: "t", genre: null, tone: null }, module: "casting" as const,
      focus: { type: "character" as const, id: ids[49], version: null, label: "Focus" },
      items: [...ids.slice(0, 48).map((id, i) => item(id, `Extra ${i}`)), item(ids[48], "Amara Bello", 9000), item(ids[49], "Focus"), ...ids.slice(50).map((id, i) => item(id, `More ${i}`))] };
    const t = trimContext(bundle, ["Amara"]);
    expect(t.items).toHaveLength(60);
    expect(t.items[0].ref.id).toBe(ids[49]);
    expect(t.items[1].ref.label).toBe("Amara Bello");
    expect(t.items[1].data).toMatchObject({ truncated: true });
  });
  it("with a focus scene, keeps every spoken line and shot and the characters who speak ahead of other characters", () => {
    const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const ch = (i: number) => ({ ref: { type: "character" as const, id: id(i), version: null, label: `Extra ${i}` }, data: {} });
    const line = (i: number, who: string) => ({ ref: { type: "dialogue_line" as const, id: id(500 + i), version: null, label: `line ${i}` }, data: { character_id: who, text: "…" } });
    const bundle = { project: { id: P, title: "t", genre: null, tone: null }, module: "dialogue" as const,
      focus: { type: "scene" as const, id: S, version: null, label: "Scene 1" },
      items: [{ ref: { type: "scene" as const, id: S, version: null, label: "Scene 1" }, data: {} }, ...Array.from({ length: 50 }, (_, i) => ch(i)), ...Array.from({ length: 30 }, (_, i) => line(i, id(49)))] };
    const t = trimContext(bundle, []);
    expect(t.items[0].ref.id).toBe(S);
    expect(t.items.filter((x) => x.ref.type === "dialogue_line")).toHaveLength(30);
    expect(t.items.find((x) => x.ref.type === "character")!.ref.id).toBe(id(49));
  });
});
