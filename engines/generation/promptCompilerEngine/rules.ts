/** Camera vocabulary (codes from packages/contracts shot) -> prompt words. */
export const SIZE_WORDS: Record<string, string> = {
  EWS: "extreme wide shot", WS: "wide shot", FULL: "full shot", MWS: "medium wide shot", COWBOY: "cowboy shot",
  MS: "medium shot", MCU: "medium close-up", CU: "close-up", ECU: "extreme close-up", TWO_SHOT: "two-shot",
  THREE_SHOT: "three-shot", GROUP: "group shot", OTS: "over-the-shoulder shot", POV: "point-of-view shot",
  INSERT: "insert detail shot", CUTAWAY: "cutaway shot",
};
export const ANGLE_WORDS: Record<string, string> = {
  eye: "eye-level", high: "high angle", low: "low angle", dutch: "dutch angle", overhead: "overhead",
  birds_eye: "bird's-eye view", worms_eye: "worm's-eye view", ground: "ground-level", hip: "hip-level",
  shoulder: "shoulder-level", aerial: "aerial",
};
export const MOVEMENT_WORDS: Record<string, string> = {
  static: "locked-off camera", pan: "panning camera", tilt: "tilting camera", push_in: "slow push-in", pull_out: "slow pull-out",
  dolly: "dolly move", truck: "trucking move", pedestal: "pedestal move", tracking: "tracking shot", arc: "arcing camera",
  crane: "crane move", gimbal: "gimbal move", steadicam: "Steadicam move", handheld: "handheld camera", drone: "drone shot",
  zoom: "zoom", dolly_zoom: "dolly zoom", whip_pan: "whip pan",
};
export const FOCUS_WORDS: Record<string, string> = {
  deep: "deep focus", shallow: "shallow depth of field", focus_pull: "focus pull", rack_focus: "rack focus", subject_tracking: "focus tracking the subject",
};
/** Always-on constraints: generated frames must not invent text or watermarks. */
export const BASE_NEGATIVE = ["no on-screen text or subtitles", "no watermarks or logos", "no distorted hands or faces"];
