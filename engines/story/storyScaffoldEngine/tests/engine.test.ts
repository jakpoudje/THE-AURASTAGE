import { describe, expect, it } from "vitest";
import { storyScaffoldEngine, outlineScaffoldEngine, readPremise } from "..";
import { checkStoryDevelopment, StoryDevelopmentOutputSchema } from "../../storyDevelopmentEngine";
import { checkOutline, OutlineOutputSchema } from "../../scriptWritingEngine";

const THRILLER = {
  title: "Shadows of Lagos", type: "feature_film", genre: "Political thriller", setting: "Lagos, Nigeria", target_runtime_minutes: 110, synopsis: null, characters: [], request: "",
  logline: "When her brother Tunde vanishes after photographing a rigged ballot count, Amara Bello, a fearless investigative journalist, must expose the conspiracy before the polls close — but Governor Adeyemi, a ruthless kingmaker, will kill to keep it buried.",
};

describe("readPremise", () => {
  it("reads people, relationships, the goal, the deadline, who is at stake and the themes", () => {
    const p = readPremise(THRILLER.logline);
    expect(p.people.map((x) => x.name)).toEqual(expect.arrayContaining(["Amara Bello", "Tunde", "Adeyemi"]));
    expect(p.people.find((x) => x.name === "Adeyemi")).toMatchObject({ title: "Governor", descriptor: "ruthless kingmaker" });
    expect(p.people.find((x) => x.name === "Tunde")).toMatchObject({ relation: "brother", absent: true });
    expect(p.goal).toBe("expose the conspiracy");
    expect(p.deadline).toBe("before the polls close");
    expect(p.themes).toEqual(expect.arrayContaining(["Corruption and the price of truth", "Power and who holds it"]));
  });
});

describe("storyScaffoldEngine", () => {
  it("builds a full story from a complex premise: the right protagonist, antagonist, who's at stake, a B-story, three threads, plant and pay-off", () => {
    const { story, family } = storyScaffoldEngine(THRILLER);
    expect(StoryDevelopmentOutputSchema.parse(story)).toBeTruthy();
    expect(family).toBe("thriller");
    expect(checkStoryDevelopment(THRILLER, story).every((c) => c.ok)).toBe(true);
    const role = (n: string) => story.characters.find((c) => c.name === n)?.role;
    expect(role("Amara Bello")).toBe("protagonist");
    expect(role("Adeyemi")).toBe("antagonist");
    expect(story.characters.find((c) => c.name === "Tunde")!.description).toMatch(/at stake/);
    const b = story.characters.find((c) => /B-story/.test(c.description))!;
    expect(b.name).not.toBe("Tunde");
    expect(b.name_reasoning).toMatch(/Yoruba names, common in Lagos/);
    // Three threads and a plant that pays off in act three.
    expect(story.beats.some((x) => /\(B-story\)/.test(x.title)) && story.beats.some((x) => /Adeyemi's plan/.test(x.title))).toBe(true);
    const plant = story.assumptions.find((a) => a.startsWith("Plant and pay-off"))!.match(/: (.*) — seen early/)![1];
    expect(story.beats.filter((x) => x.act === 1).some((x) => x.summary.includes(plant))).toBe(true);
    expect(story.beats.filter((x) => x.act === 3).some((x) => x.summary.toLowerCase().includes(plant.toLowerCase()))).toBe(true);
    expect(story.logline).toBe(THRILLER.logline);
    // No invented name shares a word with a name already used.
    const words = story.characters.flatMap((c) => c.name.split(" "));
    expect(new Set(words).size).toBe(words.length);
  });

  it("from a bare brief: invents a distinct cast for the setting, says what it assumed, and keeps names already decided", () => {
    const brief = { title: "Tides", genre: "Romance", setting: "Accra, Ghana", target_runtime_minutes: 95, characters: [{ name: "Kojo Mensah", role: "lead", description: "A fisherman", source: "casting" as const }] };
    const { story } = storyScaffoldEngine(brief);
    expect(checkStoryDevelopment(brief, story).every((c) => c.ok)).toBe(true);
    expect(story.characters[0]).toMatchObject({ name: "Kojo Mensah", role: "protagonist" });
    expect(story.characters.filter((c) => c.name_reasoning.startsWith("Built-in naming")).length).toBeGreaterThanOrEqual(2);
    expect(story.assumptions.join(" ")).toMatch(/goal wasn't stated/);
    expect(story.beats.map((x) => x.title)).toContain("Grand gesture");
  });
});

describe("short films", () => {
  it("a 3-minute film keeps the essential beats and its outline has a handful of scenes that add up", () => {
    const brief = { title: "The Last Ferry", genre: "Drama", setting: "Lagos lagoon", target_runtime_minutes: 3,
      logline: "Chief Adebayo Olumide, an old ferryman, makes his last crossing and is reunited with Kunle Olumide, the son he abandoned." };
    const { story } = storyScaffoldEngine(brief);
    expect(checkStoryDevelopment(brief, story).every((c) => c.ok)).toBe(true);
    expect(story.beats.length).toBe(3);
    expect(story.characters.map((c) => c.name)).toEqual(expect.arrayContaining(["Adebayo Olumide", "Kunle Olumide"]));
    // A father-and-son drama: no invented villain or mentor — the son is the opposing force (regression, live 2026-10-01).
    expect(story.characters.map((c) => c.name).sort()).toEqual(["Adebayo Olumide", "Kunle Olumide"]);
    expect(story.characters.find((c) => c.name === "Kunle Olumide")!.role).toBe("antagonist");
    const ctx = { title: brief.title, genre: story.genre, target_runtime_minutes: 3, characters: story.characters, beats: story.beats };
    const { outline } = outlineScaffoldEngine(ctx);
    expect(outline.scenes.length).toBeLessThanOrEqual(3);
    expect(checkOutline(ctx, outline).filter((c) => !c.ok)).toEqual([]);
  });
});

describe("outlineScaffoldEngine", () => {
  it("outlines the story to the runtime exactly, covering every beat, with every main character, in canonical places", () => {
    const { story } = storyScaffoldEngine(THRILLER);
    const ctx = { title: THRILLER.title, logline: story.logline, synopsis: story.synopsis, genre: story.genre, setting: story.setting, target_runtime_minutes: 110, characters: story.characters, beats: story.beats };
    const { outline } = outlineScaffoldEngine(ctx);
    expect(OutlineOutputSchema.parse(outline)).toBeTruthy();
    const checks = checkOutline(ctx, outline);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(Math.abs(outline.scenes.reduce((a, s) => a + s.est_minutes, 0) - 110)).toBeLessThan(0.05);
    expect(outline.scenes.length).toBeGreaterThan(30);
    expect(outline.scenes.some((s) => s.location === "POLLING STATION")).toBe(true);
    expect(outline.scenes.some((s) => s.time_of_day === "NIGHT")).toBe(true);
    // No scene is a fragment.
    expect(outline.scenes.every((s) => s.summary.length >= 40)).toBe(true);
  });
  it("with no beats yet, follows the genre structure and says so", () => {
    const { outline } = outlineScaffoldEngine({ title: "X", genre: "Horror", target_runtime_minutes: 20, characters: [{ name: "Iris Novak", role: "protagonist", age: null, description: "" }] });
    expect(outline.notes.join(" ")).toMatch(/built-in structure/);
    expect(Math.abs(outline.scenes.reduce((a, s) => a + s.est_minutes, 0) - 20)).toBeLessThan(0.05);
  });
});
