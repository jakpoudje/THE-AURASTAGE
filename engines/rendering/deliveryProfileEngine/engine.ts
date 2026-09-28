// engines/rendering/deliveryProfileEngine — the versioned delivery profile catalogue.
import { PROFILES } from "./rules";
import { DeliveryProfileError } from "./validator";
import type { DeliveryProfile } from "./output.schema";

export function deliveryProfiles(): DeliveryProfile[] {
  return PROFILES.map((p) => JSON.parse(JSON.stringify(p)) as DeliveryProfile);
}
export function deliveryProfile(id: string): DeliveryProfile {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new DeliveryProfileError(`Unknown delivery profile ${id}`);
  return JSON.parse(JSON.stringify(p)) as DeliveryProfile;
}
