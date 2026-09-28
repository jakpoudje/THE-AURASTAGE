// Matches the Audio Studio browser mix engine (apps/web/.../audio-studio/state/mixEngine.ts):
// clip gain with linear fades -> track gain -> Web Audio StereoPannerNode (equal-power) -> sum.
// Mute/solo as in the session. A scene mix plays only for its approved length.
export const dbToGain = (db: number) => Math.pow(10, db / 20);
