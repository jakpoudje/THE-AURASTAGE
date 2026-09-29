import { describe, expect, it } from "vitest";
import { LocationDnaSchema, SceneLocationStateSchema, ShotGeographySchema, type LocationDataProvider } from "@aurastage/contracts";

// Location Intelligence contracts (docs/architecture/LOCATION_INTELLIGENCE.md): forward-compatible shapes, not wired yet.
const L = "11111111-1111-4111-8111-111111111111", P = "22222222-2222-4222-8222-222222222222", S1 = "33333333-3333-4333-8333-333333333333";

describe("Location Intelligence contracts", () => {
  it("one Location DNA (identity) with several story-time states — never three different apartments", () => {
    const dna = LocationDnaSchema.parse({ location_id: L, project_id: P, version: 1, approval_status: "approved", canonical_name: "Amara's Apartment",
      location_type: "FICTIONAL", verification_status: "FICTIONAL", spatial_relations: [{ subject: "sofa", relation: "opposite", object: "television" }] });
    expect(dna.aliases).toEqual([]);
    expect(dna.geography.coordinates).toBeNull();
    const s4 = SceneLocationStateSchema.parse({ id: S1, location_id: L, location_dna_version: 1, label: "Scene 4 — clean, day", time_of_day: "DAY", condition: "clean" });
    const s81 = SceneLocationStateSchema.parse({ id: "44444444-4444-4444-8444-444444444444", location_id: L, location_dna_version: 1, label: "Scene 81 — smashed", condition: "table smashed, broken lamp", previous_state_id: S1 });
    expect(s4.location_id).toBe(s81.location_id);
  });
  it("real places carry a verification state; ambiguity is a state, not a guess", () => {
    expect(() => LocationDnaSchema.parse({ location_id: L, project_id: P, version: 1, approval_status: "candidate", canonical_name: "Tower Bridge",
      location_type: "REAL_WORLD_VERIFIED", verification_status: "VERIFIED", geography: { country: "United Kingdom", city: "London" } })).not.toThrow();
    expect(() => LocationDnaSchema.parse({ location_id: L, project_id: P, version: 1, approval_status: "candidate", canonical_name: "x", location_type: "MAYBE", verification_status: "VERIFIED" })).toThrow();
  });
  it("shot geography and the provider interface compile", () => {
    expect(ShotGeographySchema.parse({ screen_direction: "left_to_right", camera_direction: "toward bridge" }).location_reference_ids).toEqual([]);
    const test: LocationDataProvider = {
      id: "test", test_data: true, searchLocation: async () => [], resolveLocation: async () => ({}), getGeographicMetadata: async () => ({ country: null, region: null, city: null, district: null, address: null, coordinates: null }),
      getReferenceCandidates: async () => [], getSpatialMetadata: async () => [], getLicenseMetadata: async () => ({ source: "test", provider: null, identifier: null, license: null, permitted_usage: [], acquired_at: null, reference_date: null, restrictions: [], expires_at: null, ai_generated: false, derived_from_asset_ids: [] }),
    };
    expect(test.test_data).toBe(true);
  });
});
