// Edit semantics (SRS §12 NLE operations). Sync lock is always on: a ripple
// edit (insert, extract, ripple trim) removes or opens the same range on every
// track, so picture and sound after the edit stay in sync. Lift, overwrite,
// plain trims, roll, slip and slide never change the timeline length.
// Inserts (V2) and music (A2) ride along with the cut on every ripple edit, so they stay over the same picture;
// placing one never ripples anything (it lands on its own track like an overwrite).
export const SYNC_LOCKED_TRACKS = ["V1", "V2", "A1", "A2"] as const;
/** Tracks whose clips are laid over the cut rather than making it. */
export const LAYER_TRACKS = ["V2", "A2"] as const;
