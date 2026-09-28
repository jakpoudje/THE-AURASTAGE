import { describe, expect, it } from "vitest";
import { knowledgeRetrievalEngine } from "../engine";

describe("knowledgeRetrievalEngine", () => {
  it("finds the right guide for a plain question", () => {
    expect(knowledgeRetrievalEngine({ query: "How do I invite my editor?" }).guides[0].id).toBe("team");
    expect(knowledgeRetrievalEngine({ query: "export an mp4 to download" }).guides[0].id).toBe("export");
    expect(knowledgeRetrievalEngine({ query: "loudness of the mix" }).guides[0].id).toBe("audio");
  });
  it("explains an error code", () => {
    const r = knowledgeRetrievalEngine({ query: "I got AURA-EXP-412 when rendering" });
    expect(r.troubles.map((t) => t.code)).toEqual(["AURA-EXP-412"]);
  });
  it("falls back to the current workspace's guide, never nothing", () => {
    const r = knowledgeRetrievalEngine({ query: "xyzzy", module: "editorial" });
    expect(r.guides[0].id).toBe("editorial");
  });
});
