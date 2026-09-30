// What an action will cost, shown next to the button that starts it (owner request 2026-09-30: "every stage must tell
// the user the cost"). Numbers come from costEstimateEngine: published prices with their source and date, "Free" for
// built-in generators, and "price not confirmed" (with the provider's price page) rather than a guess.
import { costEstimateEngine, formatCost, type CostEstimate } from "@aurastage/engines";

type Item = { provider: string; model?: string | null; count?: number; seconds?: number; input_chars?: number; output_chars?: number };

export function estimateCost(items: Item[]): CostEstimate {
  return costEstimateEngine({ items: items.map((i) => ({ model: null, ...i })) });
}

export function CostNote({ items, label = "Estimated cost", className = "" }: { items: Item[]; label?: string; className?: string }) {
  const e = estimateCost(items);
  const total = formatCost(e.total.min, e.total.max, { free: e.free, complete: e.total.complete });
  const unconfirmed = e.lines.filter((l) => !l.free && l.min === null);
  return (
    <div data-testid="cost-note" className={`mt-2 rounded-md border border-aura-border bg-black/20 px-3 py-2 text-xs ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-white/50">{label}:</span>
        <span data-testid="cost-total" className={e.free ? "text-emerald-300" : "font-medium text-aura-gold"}>{total}</span>
        {!e.free && <span className="text-white/35">billed by the provider</span>}
      </div>
      {!e.free && (
        <details className="mt-1 text-white/45">
          <summary className="cursor-pointer select-none">How this is worked out</summary>
          <ul className="mt-1 space-y-0.5">
            {e.lines.map((l, i) => (
              <li key={i}>
                {l.label}: {formatCost(l.min, l.max, { free: l.free })} — {l.basis}
                {l.source && <> (<a href={l.source} target="_blank" rel="noreferrer" className="underline">price page</a>)</>}
              </li>
            ))}
          </ul>
          <p className="mt-1">Published prices as of {e.prices_as_of}. Your provider bills the actual amount.</p>
        </details>
      )}
      {unconfirmed.length > 0 && (
        <p className="mt-1 text-white/45">
          {unconfirmed.map((l) => l.label).join(", ")}: price not confirmed here — check the provider&apos;s price page before generating.
        </p>
      )}
    </div>
  );
}
