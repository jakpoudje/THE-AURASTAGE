# Home (frontend module)

## Purpose
Public landing page (`/`), sign-in, sign-up and password reset. Layout follows the owner's reference design
(2026-09-28): header nav, hero "Turn Your Ideas Into Extraordinary Films" with a cinematic film-set scene, feature
strip, providers row, "Create Without Limits" genre cards, "How it works" (the nine stages), footer band.

## Honesty rules (CLAUDE.md rule 12)
- The providers row lists only integrations that exist in `apps/api/src/providers`, with their real state
  ("Built in" / "Add a key to connect" / "Coming next" / "Planned") — never a brand we don't integrate with, and
  names as text, not company logos.
- "See How It Works" scrolls to the pipeline section (there is no product video yet).

## Artwork
Drawn in SVG (`components/Art.tsx`), so the page is complete with no image files. Generated images can replace them:
`OPENAI_API_KEY=... node apps/api/scripts/generate-home-art.mjs` (after `pnpm build`) writes
`apps/web/public/home/hero.png` and `genre-<id>.png` through the Provider Gateway; commit the ones you like. Missing
files simply leave the drawings visible (CSS backgrounds, so no broken-image icons).

## Tests
`tests/e2e/dashboard/run.cjs` (home page step), live browser check.
