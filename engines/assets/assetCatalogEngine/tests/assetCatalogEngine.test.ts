import { describe, expect, it } from "vitest";
import { assetCatalogEngine } from "../engine";

const S1 = "11111111-1111-4111-8111-111111111111";
const a = (id: string, o: Record<string, unknown> = {}) => ({
  id, type: "image", category: "locations", name: "Asset " + id.slice(0, 1), description: "", tags: [], archived: false, created_at: "2026-09-01T00:00:00Z", usage: [], ...o,
});
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const assets = [
  a(A, { name: "Lagos harbour at dawn", tags: ["exterior", "Harbour"], created_at: "2026-09-03T00:00:00Z", usage: [{ kind: "link", scene_id: S1, label: "Scene 1", href: null }] }),
  a(B, { type: "audio", category: "audio", name: "Room tone — newsroom", description: "Quiet ÉTAGE hum", created_at: "2026-09-02T00:00:00Z" }),
  a(C, { name: "Old poster", archived: true }),
];

describe("assetCatalogEngine", () => {
  it("lists the active library newest first with counts per category and type", () => {
    const r = assetCatalogEngine({ assets, query: {} });
    expect(r.ids).toEqual([A, B]);
    expect(r.category_counts).toEqual({ locations: 1, audio: 1 });
    expect(r.type_counts).toEqual({ image: 1, audio: 1 });
    expect(r.engine_version).toBe("1.0.0");
  });
  it("searches name, description and tags word by word, ignoring case and accents", () => {
    expect(assetCatalogEngine({ assets, query: { q: "harbour EXTERIOR" } }).ids).toEqual([A]);
    expect(assetCatalogEngine({ assets, query: { q: "etage" } }).ids).toEqual([B]);
    expect(assetCatalogEngine({ assets, query: { q: "harbour newsroom" } }).ids).toEqual([]);
  });
  it("filters by usage evidence and scene; tab counts ignore the category filter itself", () => {
    expect(assetCatalogEngine({ assets, query: { usage: "unused" } }).ids).toEqual([B]);
    expect(assetCatalogEngine({ assets, query: { scene_id: S1 } }).ids).toEqual([A]);
    const r = assetCatalogEngine({ assets, query: { category: "audio" } });
    expect(r.ids).toEqual([B]);
    expect(r.category_counts).toEqual({ locations: 1, audio: 1 });
  });
  it("shows archived assets only when asked, and sorts by name", () => {
    expect(assetCatalogEngine({ assets, query: { archived: true } }).ids).toEqual([C]);
    expect(assetCatalogEngine({ assets, query: { sort: "name" } }).ids).toEqual([A, B]);
  });
});
