import { describe, expect, it } from "vitest";
import { DeliveryProfileIdSchema } from "@aurastage/contracts";
import { deliveryProfile, deliveryProfiles } from "../engine";
import { DeliveryProfileSchema } from "../output.schema";

describe("deliveryProfileEngine", () => {
  it("every available profile is one the API accepts and is fully specified", () => {
    const avail = deliveryProfiles().filter((p) => p.available);
    expect(avail.map((p) => p.id).sort()).toEqual([...DeliveryProfileIdSchema.options].sort());
    for (const p of deliveryProfiles()) expect(DeliveryProfileSchema.parse(p)).toBeTruthy();
    for (const p of avail) expect(p.files.length).toBeGreaterThan(0);
  });
  it("unavailable profiles say why, and never claim a spec", () => {
    for (const p of deliveryProfiles().filter((x) => !x.available)) {
      expect(p.unavailable_reason).toBeTruthy();
      expect(p.video).toBeNull();
      expect(p.files).toEqual([]);
    }
  });
  it("returns copies and refuses unknown ids", () => {
    const a = deliveryProfile("streaming_master");
    a.label = "x";
    expect(deliveryProfile("streaming_master").label).toBe("Streaming Master");
    expect(() => deliveryProfile("nope")).toThrow(/Unknown/);
  });
});
