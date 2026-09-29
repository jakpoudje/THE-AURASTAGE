// "Annotate scene N in one pass": every spoken line's performance and the scene's DNA as one proposal; the labelled test
// planner fills only empty fields (never overwrites what a writer already set).
import { describe, expect, it } from "vitest";
import { PlanSchema } from "@aurastage/aura-intelligence";
import { readLine, testReasoningAdapter } from "../test/testReasoningAdapter";

const S = "22222222-2222-4222-8222-222222222222";
const L = (i: number) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`;
const line = (i: number, text: string, extra: Record<string, unknown> = {}) =>
  ({ ref: { type: "dialogue_line", id: L(i), label: `AMARA line ${i}` }, data: { speaker: "AMARA", character_id: null, text, parenthetical: null, intention: null, subtext: null, emotion: null, intensity: null, ...extra } });
const snapshot = (items: unknown[]) => ({
  request: { text: "Annotate scene 1 in one pass: every line's intention, subtext, emotion and intensity, and the scene's Scene DNA. Fill what is empty; keep what is already written.", module: "dialogue", object: null },
  context: { focus: { type: "scene", id: S }, items: [{ ref: { type: "scene", id: S, label: "Scene 1" }, data: { number: 1, action: "Rain hammers the window. Footsteps in the corridor.", dna: { mood: [], atmosphere: null, sound_intent: null, camera_energy: null } } }, ...items] },
  tools: ["modifyDialogue", "updateSceneDNA"],
});
const plan = async (items: unknown[]) => (await testReasoningAdapter.complete({ system: "", prompt: "", schema: PlanSchema, task: { kind: "plan", snapshot: snapshot(items) } }, {})).data;

describe("one pass over a scene (test planner)", () => {
  it("annotates every line and fills the scene's DNA in one proposal", async () => {
    const p = await plan([line(1, "Get out of my house!"), line(2, "Where were you last night?"), line(3, "I have to tell the truth.")]);
    const dlg = p.calls.filter((c) => c.tool === "modifyDialogue").map((c) => JSON.parse(c.input_json));
    expect(dlg.map((d) => d.changes.emotion)).toEqual(["anger", "anticipation", "determination"]);
    expect(dlg[0].changes.intensity).toBe(9);
    const dna = JSON.parse(p.calls.find((c) => c.tool === "updateSceneDNA")!.input_json);
    expect(dna).toMatchObject({ scene_id: S, changes: { mood: ["volatile", "expectant", "resolute"], camera_energy: "measured" } });
    expect(dna.changes.sound_intent).toMatch(/rain, footsteps/);
    expect(p.questions).toEqual([]);
  });
  it("keeps what a writer already wrote", async () => {
    const p = await plan([line(1, "Get out!", { emotion: "fear", intensity: 4, intention: "Protect her son" })]);
    expect(p.calls.some((c) => c.tool === "modifyDialogue")).toBe(false);
  });
  it("reads lines deterministically from their words and punctuation", () => {
    expect(readLine("I'm so sorry.")).toMatchObject({ emotion: "sadness" });
    expect(readLine("Okay.")).toMatchObject({ emotion: "neutral", intensity: 3 });
  });
});

describe("develop a character's profile (test planner)", () => {
  const C = "44444444-4444-4444-8444-444444444444";
  const snap = (data: Record<string, unknown>) => ({
    request: { text: "Develop Amara Bello's profile in one pass: fill every empty field (accent, languages, personality) from the script and the story.", module: "casting", object: null },
    context: { focus: null, items: [{ ref: { type: "project", id: "p", label: "Shadows" }, data: { setting: "Lagos, Nigeria" } }, { ref: { type: "character", id: C, label: "Amara Bello" }, data }] },
    tools: ["updateCharacter"],
  });
  const plan = async (data: Record<string, unknown>) => (await testReasoningAdapter.complete({ system: "", prompt: "", schema: PlanSchema, task: { kind: "plan", snapshot: snap(data) } }, {})).data;
  it("fills accent and languages from the story and says plainly what needs a real writer", async () => {
    const p = await plan({ name: "Amara Bello", accent: null, languages: null, personality: null });
    expect(JSON.parse(p.calls[0].input_json)).toEqual({ character_id: C, changes: { accent: "Nigerian English (south-west, Lagos)", languages: "English, Yoruba, Nigerian Pidgin" } });
    expect(p.not_possible.join(" ")).toMatch(/personality.*needs a connected writer/);
  });
  it("keeps an accent the writer already chose", async () => {
    const p = await plan({ name: "Amara Bello", accent: "Received Pronunciation", languages: "English, French" });
    expect(p.calls).toHaveLength(0);
  });
});
