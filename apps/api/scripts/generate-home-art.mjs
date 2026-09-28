// Generates the home page's cinematic artwork through the Provider Gateway (CLAUDE.md rule 7) and writes it to
// apps/web/public/home/<name>.png, where the home page picks it up (the SVG drawings stay as the fallback).
// Usage (after `pnpm build`):  OPENAI_API_KEY=... node apps/api/scripts/generate-home-art.mjs [--only hero,genre-drama]
// Nothing is committed automatically: look at the images, then commit the ones you want.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter } from "../dist/providers/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../web/public/home");
const STYLE = "Cinematic film still, dramatic low-key lighting, warm gold and deep teal palette, shallow depth of field, anamorphic, 35mm film grain, photorealistic.";
const NEGATIVE = ["text", "watermark", "logos", "brand names", "extra fingers", "distorted faces"];
const SHOTS = {
  hero: ["16:9", "A night-time film set on a rooftop above a glittering city skyline: tungsten stage lights glowing, a director's chair with a blank black canvas back, a large monitor showing an epic fantasy castle at dusk with a cloaked figure, editing screens with timelines in the background."],
  "genre-action": ["9:16", "A soldier in tactical gear walking away from a massive explosion in a ruined city, helicopter overhead."],
  "genre-drama": ["9:16", "Close portrait of a thoughtful West African woman in warm window light, tears held back, earrings, soft background."],
  "genre-scifi": ["9:16", "An astronaut standing on an alien ridge under a giant blue planet and a starry sky, distant futuristic spires."],
  "genre-fantasy": ["9:16", "A vast fantasy castle on a cliff at golden hour, waterfalls, birds, epic scale."],
  "genre-thriller": ["9:16", "A lone figure in a long coat in a rain-soaked neon-lit alley at night, city towers behind."],
  "genre-animation": ["9:16", "Stylised 3D animated film still: a cheerful curly-haired child with big expressive eyes in a warm evening city."],
  "genre-documentary": ["9:16", "Wildlife documentary still: an elephant walking across the savanna at sunset, acacia trees."],
  "genre-romance": ["9:16", "A couple silhouetted face to face against a fiery sunset over the sea, intimate moment."],
};

const only = (process.argv.find((a) => a.startsWith("--only")) ? process.argv[process.argv.indexOf("--only") + 1] ?? "" : "").split(",").filter(Boolean);
const adapter = getAdapter("openai");
if (!adapter.isConfigured(process.env)) {
  console.error("OPENAI_API_KEY is not set — nothing generated. The home page keeps its drawn artwork.");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const [name, [ratio, scene]] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  const r = await adapter.generate({
    capability: "image", model: "gpt-image-1", aspect_ratio: ratio, duration_seconds: null, seed: null,
    package: { prompt: `${scene} ${STYLE}`, negative: NEGATIVE },
  }, process.env);
  writeFileSync(join(out, `${name}.png`), r.bytes);
  console.log(`wrote ${name}.png (${Math.round(r.bytes.length / 1024)} KB)`);
}
