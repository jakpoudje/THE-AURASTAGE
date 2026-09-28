// Assembly rules (SRS §12: "First assembly may use approved shot order, dialogue
// timing, action continuity and emotional beats; editor retains control").
// Shots overlap in story time when they cover the same action (coverage). The
// assembly cuts to the most recently started shot that covers the moment, and
// returns to the covering shot when a tighter one ends. Story time with no shot
// becomes an offline slug so gaps are visible, never hidden.
export const SLUG_MISSING_COVERAGE = "No shot covers this moment";
