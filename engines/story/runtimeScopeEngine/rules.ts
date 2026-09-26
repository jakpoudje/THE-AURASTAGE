// Genre priors for mean scene duration (minutes). SRS §5.1 calls these a
// configurable planning prior, not a filmmaking rule. They are rough industry
// rules of thumb: faster genres cut more often, character-driven genres linger.

export const GENRE_MEAN_SCENE_MINUTES: Record<string, number> = {
  action: 1.6,
  thriller: 1.9,
  horror: 2.0,
  comedy: 2.0,
  "sci-fi": 2.1,
  "science fiction": 2.1,
  animation: 1.8,
  crime: 2.1,
  romance: 2.4,
  drama: 2.6,
  historical: 2.8,
  documentary: 3.0,
};
export const DEFAULT_MEAN_SCENE_MINUTES = 2.2;

/** Classic three-act split used as the default structure. */
export const THREE_ACT_SPLIT = [
  { act: 1, label: "Setup", share: 0.25 },
  { act: 2, label: "Confrontation", share: 0.5 },
  { act: 3, label: "Resolution", share: 0.25 },
];

/** Page count heuristic: ~1 page per minute, ±10%. */
export const PAGE_TOLERANCE = 0.1;

export function meanSceneMinutesFor(genre: string | null | undefined): { minutes: number; matched: string | null } {
  if (!genre) return { minutes: DEFAULT_MEAN_SCENE_MINUTES, matched: null };
  const g = genre.toLowerCase();
  for (const [key, minutes] of Object.entries(GENRE_MEAN_SCENE_MINUTES)) {
    if (g.includes(key)) return { minutes, matched: key };
  }
  return { minutes: DEFAULT_MEAN_SCENE_MINUTES, matched: null };
}
