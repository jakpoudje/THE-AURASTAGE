// Published list prices (owner request 2026-09-30: "every stage must tell the user the cost"). Each price names where
// it was published; only prices confirmed on the provider's own site are here. A model without a confirmed price is
// `null` and the page says "see <provider>'s price page" — never a guessed number (rule 12). Providers bill the actual
// amount; these are estimates for deciding before you click. Update PRICES_AS_OF with every change.
export const PRICES_AS_OF = "2026-09-30";

export type Price =
  | { unit: "image"; min: number; max: number }
  | { unit: "video_second"; min: number; max: number }
  | { unit: "mtok"; input: number; output: number };

export interface PriceEntry { provider: string; model: string; label: string; price: Price | null; source: string }

export const BUILT_IN_PROVIDERS = new Set(["aurastage-sketch", "aurastage-test", "aurastage-voice", "aurastage-neural-voice", "aurastage-synth", "aurastage-render", "aurastage"]);

export const PRICE_PAGES: Record<string, string> = {
  anthropic: "https://www.anthropic.com/pricing",
  openai: "https://openai.com/api/pricing/",
  google: "https://ai.google.dev/gemini-api/docs/pricing",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing",
  runway: "https://docs.dev.runwayml.com/guides/pricing/",
  bfl: "https://bfl.ai/pricing",
  stability: "https://platform.stability.ai/pricing",
  luma: "https://lumalabs.ai/api/pricing",
  kling: "https://kling.ai/dev/pricing",
  minimax: "https://platform.minimax.io/docs/guides/pricing-video",
};

export const PRICES: PriceEntry[] = [
  // AI writing (Ask AuraStage, AuraScript, Develop with AI)
  { provider: "anthropic", model: "claude-opus-5-5", label: "Claude Opus 5.5", price: { unit: "mtok", input: 4, output: 20 }, source: PRICE_PAGES.anthropic },
  { provider: "openai", model: "gpt-5", label: "GPT-5", price: { unit: "mtok", input: 1.25, output: 10 }, source: PRICE_PAGES.openai },
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", price: null, source: PRICE_PAGES.gemini },
  // Images
  { provider: "openai", model: "gpt-image-1", label: "GPT Image 1 (1536×1024, quality chosen by OpenAI)", price: { unit: "image", min: 0.016, max: 0.25 }, source: PRICE_PAGES.openai },
  { provider: "bfl", model: "flux-pro-1.1", label: "FLUX 1.1 [pro]", price: { unit: "image", min: 0.04, max: 0.04 }, source: PRICE_PAGES.bfl },
  { provider: "bfl", model: "flux-pro-1.1-ultra", label: "FLUX 1.1 [pro] Ultra", price: { unit: "image", min: 0.06, max: 0.06 }, source: PRICE_PAGES.bfl },
  { provider: "bfl", model: "flux-kontext-pro", label: "FLUX.1 Kontext [pro]", price: { unit: "image", min: 0.04, max: 0.04 }, source: PRICE_PAGES.bfl },
  { provider: "stability", model: "stable-image-ultra", label: "Stable Image Ultra", price: { unit: "image", min: 0.08, max: 0.08 }, source: PRICE_PAGES.stability },
  { provider: "stability", model: "stable-image-core", label: "Stable Image Core", price: null, source: PRICE_PAGES.stability },
  { provider: "stability", model: "sd3.5-large", label: "Stable Diffusion 3.5 Large", price: null, source: PRICE_PAGES.stability },
  { provider: "stability", model: "sd3.5-large-turbo", label: "Stable Diffusion 3.5 Large Turbo", price: null, source: PRICE_PAGES.stability },
  { provider: "google", model: "imagen-4.0-generate-001", label: "Imagen 4", price: null, source: PRICE_PAGES.google },
  { provider: "google", model: "imagen-4.0-ultra-generate-001", label: "Imagen 4 Ultra", price: null, source: PRICE_PAGES.google },
  { provider: "runway", model: "gen4_image", label: "Runway Gen-4 Image", price: null, source: PRICE_PAGES.runway },
  { provider: "luma", model: "photon-1", label: "Luma Photon", price: null, source: PRICE_PAGES.luma },
  { provider: "luma", model: "photon-flash-1", label: "Luma Photon Flash", price: null, source: PRICE_PAGES.luma },
  // Video (per second of video made)
  { provider: "runway", model: "gen4_turbo", label: "Runway Gen-4 Turbo (5 credits/s at $0.01)", price: { unit: "video_second", min: 0.05, max: 0.05 }, source: PRICE_PAGES.runway },
  { provider: "google", model: "veo-3.0-generate-001", label: "Veo 3 (720p/1080p with sound)", price: { unit: "video_second", min: 0.4, max: 0.4 }, source: PRICE_PAGES.google },
  { provider: "google", model: "veo-3.0-fast-generate-001", label: "Veo 3 Fast (720p/1080p)", price: { unit: "video_second", min: 0.1, max: 0.12 }, source: PRICE_PAGES.google },
  { provider: "luma", model: "ray-2", label: "Luma Ray 2 (720p 16:9; $0.01582 per million pixels)", price: { unit: "video_second", min: 0.35, max: 0.35 }, source: PRICE_PAGES.luma },
  { provider: "luma", model: "ray-flash-2", label: "Luma Ray 2 Flash", price: null, source: PRICE_PAGES.luma },
  { provider: "kling", model: "kling-v2-1-master", label: "Kling 2.1 Master", price: null, source: PRICE_PAGES.kling },
  { provider: "kling", model: "kling-v2-1", label: "Kling 2.1", price: null, source: PRICE_PAGES.kling },
  { provider: "kling", model: "kling-v1-6", label: "Kling 1.6", price: null, source: PRICE_PAGES.kling },
  { provider: "minimax", model: "MiniMax-Hailuo-02", label: "Hailuo 02", price: null, source: PRICE_PAGES.minimax },
  { provider: "minimax", model: "I2V-01-live", label: "I2V-01 Live", price: null, source: PRICE_PAGES.minimax },
];
