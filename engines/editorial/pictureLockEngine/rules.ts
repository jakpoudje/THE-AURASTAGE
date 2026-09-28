// SRS §12: "Breaking [Picture Lock] triggers impact analysis for sound, ADR,
// Foley, subtitles, VFX, color and renders." A scene is affected when its
// picture cut changes; later scenes that only move need conform, not re-work.
export const RECUT_AFFECTS = ["Sound mix (re-conform)", "ADR & Foley sync", "Subtitles timing", "Color grade", "VFX shots", "Renders & deliveries"];
export const MOVE_AFFECTS = ["Subtitles timing", "Renders & deliveries"];
