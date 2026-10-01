import { describe, expect, it } from "vitest";
import { relationshipMapEngine } from "../engine";

const characters = [{ id: "a", name: "Amara Okafor" }, { id: "t", name: "Tunde Okafor" }, { id: "m", name: "Mama Nkechi" }, { id: "x", name: "Officer Bello" }];
const appearances = [
  { character_id: "a", scene_id: "s1" }, { character_id: "m", scene_id: "s1" },
  { character_id: "a", scene_id: "s2" }, { character_id: "t", scene_id: "s2" }, { character_id: "x", scene_id: "s2" },
  { character_id: "a", scene_id: "s3" }, { character_id: "t", scene_id: "s3" },
];

describe("relationshipMapEngine", () => {
  it("links everyone who shares scenes and suggests only what the dialogue states, with the line", () => {
    const out = relationshipMapEngine({
      characters, appearances,
      lines: [
        { scene_id: "s1", scene_number: 1, speaker_id: "a", text: "Mama, I have to go." },
        { scene_id: "s2", scene_number: 2, speaker_id: "a", text: "Tunde, my brother, listen." },
        { scene_id: "s2", scene_number: 2, speaker_id: "x", text: "Move along." },
        { scene_id: "s2", scene_number: 2, speaker_id: "t", text: "Sir, we are leaving." },
      ],
    });
    expect(out.nodes.find((n) => n.id === "a")!.scenes).toBe(3);
    const at = out.edges.find((e) => [e.a, e.b].sort().join() === "a,t")!;
    expect(at.shared_scenes).toBe(2);
    expect(at.suggestion).toMatchObject({ relationship: "Siblings" });
    expect(at.suggestion!.evidence).toContain("Scene 2: Amara Okafor to Tunde Okafor");
    expect(out.edges.find((e) => [e.a, e.b].sort().join() === "a,m")!.suggestion!.relationship).toBe("Parent and child");
    // "Sir" said in a scene with two other speakers and no name: not attributed to anyone.
    expect(out.edges.find((e) => [e.a, e.b].sort().join() === "t,x")!.suggestion).toBeNull();
    expect(out.engine_version).toBe("1.0.0");
  });

  it("a saved relationship wins over a suggestion; pairs with nothing in common are left out", () => {
    const out = relationshipMapEngine({
      characters, appearances,
      lines: [{ scene_id: "s1", scene_number: 1, speaker_id: "a", text: "Mama, I have to go." }],
      relationships: [{ character_a: "m", character_b: "a", relationship: "Aunt" }],
    });
    const am = out.edges.find((e) => [e.a, e.b].sort().join() === "a,m")!;
    expect(am).toMatchObject({ relationship: "Aunt", suggestion: null });
    expect(out.edges.some((e) => [e.a, e.b].sort().join() === "m,t")).toBe(false);
  });
});
