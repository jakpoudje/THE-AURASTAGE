import { beforeEach, describe, expect, it } from "vitest";
import { clearScriptVersionCache, readScriptVersion } from "../scriptVersionCache";

// A tiny RLS-like fake: `visible` decides whether this caller can read the row; `selects` records what was asked for.
function fakeDb(rows: Record<string, unknown>[], visible = true) {
  const selects: string[] = [];
  const db = {
    selects,
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return { eq: (_c: string, id: string) => ({ limit: async () => ({ data: visible ? rows.filter((r) => r.id === id) : [], error: null }) }) };
      },
    }),
  };
  return db;
}

describe("readScriptVersion (BUILD_PLAN item 50)", () => {
  beforeEach(() => clearScriptVersionCache());
  const row = { id: "v1", version_number: 3, elements: [{ index: 0, type: "action", text: "Rain." }] };

  it("reads the script once, then only checks access", async () => {
    const db = fakeDb([row]);
    expect(await readScriptVersion(db, "v1")).toEqual(row);
    expect(await readScriptVersion(db, "v1")).toEqual(row);
    expect(db.selects).toEqual(["id, version_number, elements", "id, version_number"]);
  });

  it("never hands a cached script to someone who can't read it", async () => {
    await readScriptVersion(fakeDb([row]), "v1");
    expect(await readScriptVersion(fakeDb([row], false), "v1")).toBeNull();
  });

  it("returns null for a version that doesn't exist", async () => {
    expect(await readScriptVersion(fakeDb([]), "nope")).toBeNull();
  });
});
