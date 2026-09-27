// Plain-language names for the cinematography vocabulary (SRS §9). The stored
// values stay the canonical enum codes; this is display only.
import type { ShotAngle, ShotMovement, ShotPurpose, ShotSize } from "@aurastage/contracts";

export const SIZE: Record<ShotSize, { badge: string; label: string }> = {
  EWS: { badge: "EWS", label: "Extreme wide" },
  WS: { badge: "WS", label: "Wide" },
  FULL: { badge: "FS", label: "Full shot" },
  MWS: { badge: "MWS", label: "Medium wide" },
  COWBOY: { badge: "CWB", label: "Cowboy" },
  MS: { badge: "MS", label: "Medium" },
  MCU: { badge: "MCU", label: "Medium close-up" },
  CU: { badge: "CU", label: "Close-up" },
  ECU: { badge: "ECU", label: "Extreme close-up" },
  TWO_SHOT: { badge: "2S", label: "Two-shot" },
  THREE_SHOT: { badge: "3S", label: "Three-shot" },
  GROUP: { badge: "GRP", label: "Group" },
  OTS: { badge: "OTS", label: "Over the shoulder" },
  POV: { badge: "POV", label: "Point of view" },
  INSERT: { badge: "INS", label: "Insert" },
  CUTAWAY: { badge: "CUT", label: "Cutaway" },
};
export const PURPOSE: Record<ShotPurpose, string> = {
  establishing: "Establishing",
  master: "Master",
  dialogue: "Dialogue",
  reaction: "Reaction",
  action: "Action",
  insert: "Insert / detail",
  transition: "Transition",
};
export const ANGLE: Record<ShotAngle, string> = {
  eye: "Eye level", high: "High", low: "Low", dutch: "Dutch", overhead: "Overhead", birds_eye: "Bird's-eye",
  worms_eye: "Worm's-eye", ground: "Ground", hip: "Hip", shoulder: "Shoulder", aerial: "Aerial",
};
export const MOVEMENT: Record<ShotMovement, string> = {
  static: "Static", pan: "Pan", tilt: "Tilt", push_in: "Push in", pull_out: "Pull out", dolly: "Dolly", truck: "Truck",
  pedestal: "Pedestal", tracking: "Tracking", arc: "Arc / orbit", crane: "Crane / jib", gimbal: "Gimbal", steadicam: "Steadicam",
  handheld: "Handheld", drone: "Drone", zoom: "Zoom", dolly_zoom: "Dolly zoom", whip_pan: "Whip pan",
};
export const SUPPORT: Record<string, string> = {
  tripod: "Tripod", shoulder: "Shoulder", handheld: "Handheld", gimbal: "Gimbal", steadicam: "Steadicam", dolly: "Dolly / slider",
  crane: "Crane / jib", vehicle: "Vehicle rig", drone: "Drone", virtual: "Virtual camera",
};
export const FOCUS: Record<string, string> = {
  deep: "Deep focus", shallow: "Shallow focus", focus_pull: "Focus pull", rack_focus: "Rack focus", subject_tracking: "Subject tracking",
};
export const TRANSITION: Record<string, string> = {
  cut: "Cut", match_cut: "Match cut", dissolve: "Dissolve", fade: "Fade", smash_cut: "Smash cut", j_cut: "J-cut", l_cut: "L-cut",
};
export const secs = (x: number) => `${Math.round(x * 10) / 10}s`;
