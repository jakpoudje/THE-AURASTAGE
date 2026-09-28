// Edit semantics (SRS §12 NLE operations). Sync lock is always on: a ripple
// edit (insert, extract, ripple trim) removes or opens the same range on every
// track, so picture and sound after the edit stay in sync. Lift, overwrite,
// plain trims, roll, slip and slide never change the timeline length.
export const SYNC_LOCKED_TRACKS = ["V1", "A1"] as const;
