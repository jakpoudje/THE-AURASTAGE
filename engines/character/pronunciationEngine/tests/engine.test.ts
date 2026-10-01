import { describe, expect, it } from "vitest";
import { pronunciationEngine } from "../engine";

describe("pronunciationEngine", () => {
  it("sounds out names an English voice would misread, keeping English words as written", () => {
    expect(pronunciationEngine({ name: "Adebayo Okafor", languages: "English, Yoruba" }).pronunciation).toBe("ah-deh-bah-yoh oh-kah-fohr");
    expect(pronunciationEngine({ name: "Ngozi", languages: null }).pronunciation).toBe("ngoh-zee");
    expect(pronunciationEngine({ name: "Detective Ramos" }).pronunciation).toBeNull();
    expect(pronunciationEngine({ name: "John Smith", languages: "English, Yoruba" }).pronunciation).toBeNull();
  });
  it("says what it did and that stress and tone are not guessed", () => {
    const p = pronunciationEngine({ name: "Chiamaka", accent: "Lagos Nigerian English" });
    expect(p.pronunciation).toBe("chee-ah-mah-kah");
    expect(p.why).toMatch(/Stress and tone aren't marked/);
    expect(p.engine_version).toBe("1.0.0");
  });
});

import { sayNames } from "../engine";
describe("sayNames", () => {
  it("speaks each name as its pronunciation, whole or in part; other words stay", () => {
    const names = [{ name: "Adebayo Okafor", pronunciation: "ah-deh-bah-yoh oh-kah-fohr" }, { name: "John", pronunciation: null }];
    expect(sayNames("Adebayo! Where is Mr Okafor? Ask John.", names)).toBe("ah-deh-bah-yoh! Where is Mr oh-kah-fohr? Ask John.");
    expect(sayNames("Adebayo Okafor came.", names)).toBe("ah-deh-bah-yoh oh-kah-fohr came.");
  });
});
