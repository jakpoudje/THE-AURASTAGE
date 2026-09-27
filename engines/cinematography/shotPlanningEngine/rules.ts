import type { CameraEnergy, ShotMovement, ShotSize } from "@aurastage/contracts";

/** Conventional starting focal lengths (full-frame equivalent) per shot size. */
export const LENS_BY_SIZE: Partial<Record<ShotSize, number>> = {
  EWS: 18, WS: 24, FULL: 28, MWS: 32, COWBOY: 35, MS: 40, MCU: 50, CU: 85, ECU: 100,
  TWO_SHOT: 35, THREE_SHOT: 32, GROUP: 28, OTS: 50, POV: 35, INSERT: 100, CUTAWAY: 50,
};

/** Closer framing as emotional intensity (Dialogue 1–10) rises. */
export function sizeForIntensity(intensity: number | null): ShotSize {
  if (intensity !== null && intensity >= 8) return "CU";
  if (intensity !== null && intensity >= 5) return "MCU";
  return "MS";
}

/** Camera energy (Scene DNA) -> default movement/support for wide and close shots. */
export const ENERGY: Record<CameraEnergy, { wide: [ShotMovement, "tripod" | "dolly" | "gimbal" | "handheld" | "steadicam"]; close: [ShotMovement, "tripod" | "dolly" | "gimbal" | "handheld" | "steadicam"] }> = {
  calm: { wide: ["static", "tripod"], close: ["static", "tripod"] },
  measured: { wide: ["dolly", "dolly"], close: ["static", "tripod"] },
  dynamic: { wide: ["tracking", "gimbal"], close: ["gimbal", "gimbal"] },
  frenetic: { wide: ["handheld", "handheld"], close: ["handheld", "handheld"] },
};

export const ESTABLISHING_SECONDS = 4;
/** Breath after each line so cuts don't clip performance. */
export const LINE_PAD_SECONDS = 0.5;
/** A listener's reaction is planned after lines at or above this intensity. */
export const REACTION_INTENSITY = 7;
export const REACTION_SECONDS = 1.5;
