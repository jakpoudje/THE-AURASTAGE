import { describe, expect, it } from "vitest";
import { wardrobeSuggestionEngine } from "../engine";

describe("wardrobeSuggestionEngine", () => {
  it("uses what the script says they wear first", () => {
    const out = wardrobeSuggestionEngine({ character: { name: "Presiding Officer" }, mentions: ["The PRESIDING OFFICER (25), a corps member in sweat-dark khaki, holds each ballot up."], project: { setting: "Lagos", time_period: "2023" } });
    expect(out.source).toBe("script");
    expect(out.look.name).toBe("As written: sweat-dark khaki");
    expect(out.look.description).toMatch(/Lagos, 2023/);
  });
  it("then their work, then the setting — never a name", () => {
    expect(wardrobeSuggestionEngine({ character: { name: "X", occupation: "Police inspector" } })).toMatchObject({ source: "occupation", look: { name: "Police uniform" } });
    const plain = wardrobeSuggestionEngine({ character: { name: "Adebayo", age: "40" }, project: { setting: "Lagos" } });
    expect(plain).toMatchObject({ source: "setting", look: { name: "Everyday look" } });
    expect(plain.look.description).toMatch(/someone of 40 in Lagos/);
  });
});
