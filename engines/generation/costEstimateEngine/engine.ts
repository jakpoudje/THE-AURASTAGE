// engines/generation/costEstimateEngine
// What an action will cost before it runs (owner request 2026-09-30), from the published prices in ./prices.
// Built-in generators are free. A paid model without a confirmed price gives no number — the line says so and points
// to the provider's price page, and the total is then only a lower bound ("at least"). Deterministic; no network.
import { z } from "zod";
import { BUILT_IN_PROVIDERS, PRICE_PAGES, PRICES, PRICES_AS_OF } from "./prices";
import { ENGINE_VERSION } from "./version";

export const CostItemSchema = z.object({
  provider: z.string(),
  model: z.string().nullable().default(null),
  /** Images or clips to make. */
  count: z.number().int().min(0).max(1000).default(1),
  /** Seconds per clip (video). */
  seconds: z.number().min(0).max(600).default(5),
  /** AI writing: text sent and expected back, in characters (≈ 4 per token). */
  input_chars: z.number().int().min(0).default(0),
  output_chars: z.number().int().min(0).default(0),
});
export const CostEstimateInputSchema = z.object({ items: z.array(CostItemSchema).max(200) });
export type CostEstimateInput = z.input<typeof CostEstimateInputSchema>;

export interface CostLine { provider: string; model: string | null; label: string; free: boolean; min: number | null; max: number | null; basis: string; source: string | null }
export interface CostEstimate {
  lines: CostLine[];
  /** Sum of the lines with a price; `complete` is false when some paid line has no confirmed price. */
  total: { min: number; max: number; complete: boolean };
  free: boolean;
  prices_as_of: string;
  engine_version: string;
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;

export function costEstimateEngine(raw: unknown): CostEstimate {
  const { items } = CostEstimateInputSchema.parse(raw);
  const lines: CostLine[] = items.map((it) => {
    if (BUILT_IN_PROVIDERS.has(it.provider)) return { provider: it.provider, model: it.model, label: "Built in", free: true, min: 0, max: 0, basis: "Free — runs on AuraStage.", source: null };
    const e = PRICES.find((p) => p.provider === it.provider && p.model === it.model);
    const source = e?.source ?? PRICE_PAGES[it.provider] ?? null;
    const label = e?.label ?? `${it.provider}${it.model ? ` ${it.model}` : ""}`;
    if (!e?.price) return { provider: it.provider, model: it.model, label, free: false, min: null, max: null, basis: "Paid — no confirmed price here; see the provider's price page.", source };
    const p = e.price;
    if (p.unit === "image") return { provider: it.provider, model: it.model, label, free: false, min: r4(p.min * it.count), max: r4(p.max * it.count), basis: `${it.count} image${it.count === 1 ? "" : "s"} × $${p.min === p.max ? p.min : `${p.min}–${p.max}`}`, source };
    if (p.unit === "video_second") {
      const s = it.count * it.seconds;
      return { provider: it.provider, model: it.model, label, free: false, min: r4(p.min * s), max: r4(p.max * s), basis: `${it.count} clip${it.count === 1 ? "" : "s"} × ${it.seconds}s × $${p.min === p.max ? p.min : `${p.min}–${p.max}`}/s`, source };
    }
    const tin = Math.ceil(it.input_chars / 4), tout = Math.ceil(it.output_chars / 4);
    const usd = (tin * p.input + tout * p.output) / 1e6;
    // Writing length varies: the estimate spans half to double the expected reply.
    const lo = (tin * p.input + (tout / 2) * p.output) / 1e6, hi = (tin * p.input + tout * 2 * p.output) / 1e6;
    return { provider: it.provider, model: it.model, label, free: false, min: r4(Math.min(lo, usd)), max: r4(Math.max(hi, usd)), basis: `about ${tin.toLocaleString("en")} tokens in and ${tout.toLocaleString("en")} out at $${p.input}/$${p.output} per million`, source };
  });
  const priced = lines.filter((l) => l.min !== null);
  return {
    lines,
    total: { min: r4(priced.reduce((s, l) => s + (l.min ?? 0), 0)), max: r4(priced.reduce((s, l) => s + (l.max ?? 0), 0)), complete: priced.length === lines.length },
    free: lines.every((l) => l.free),
    prices_as_of: PRICES_AS_OF,
    engine_version: ENGINE_VERSION,
  };
}

/** "$0.05", "$0.02–$0.19", "Free", "at least $0.40", or "price not confirmed" — for one line or the total. */
export function formatCost(min: number | null, max: number | null, opts: { free?: boolean; complete?: boolean } = {}): string {
  if (opts.free) return "Free";
  if (min === null || max === null) return "price not confirmed";
  const f = (x: number) => (x === 0 ? "$0" : x < 0.01 ? "under $0.01" : `$${x < 1 ? x.toFixed(2) : x.toFixed(2)}`);
  const v = Math.abs(max - min) < 0.005 ? f(max) : `${f(min)}–${f(max)}`;
  return opts.complete === false ? `at least ${f(min)}` : v;
}
