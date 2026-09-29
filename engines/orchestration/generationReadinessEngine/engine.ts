// engines/orchestration/generationReadinessEngine — the "is it ready?" answer for every kind of generation
// (owner, 2026-09-28: "assure me the platform is ready for end-to-end generation before I pay for providers").
// Each capability's state is decided from two kinds of evidence only: which backends are built and configured on the
// server, and what has actually been made in this project (last success / failure). Nothing is guessed.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const BackendSchema = z.object({
  id: z.string(), name: z.string(),
  /** native = runs inside AuraStage (free); external = a paid provider; test = labelled development output. */
  execution: z.enum(["native", "external", "test"]),
  state: z.enum(["configured", "not_configured", "not_built"]),
  /** The server variable that switches it on (external only). */
  key: z.string().nullable().default(null),
  quality: z.string().max(200).default(""),
});
export const CapabilityInputSchema = z.object({
  id: z.string(), label: z.string(), where: z.string(), href: z.string().nullable().default(null),
  backends: z.array(BackendSchema),
  evidence: z.object({
    succeeded: z.number().int().min(0), failed: z.number().int().min(0),
    last_success_at: z.string().nullable(), last_success_backend: z.string().nullable(),
    last_error: z.string().nullable().default(null),
  }),
});
export type CapabilityInput = z.input<typeof CapabilityInputSchema>;

export type ReadinessState = "proven" | "ready" | "needs_key" | "not_built";
export interface CapabilityReadiness {
  id: string; label: string; where: string; href: string | null;
  state: ReadinessState;
  headline: string;
  /** What works today, with evidence. */
  now: string[];
  /** What a key would switch on (paid), with the exact variable name. */
  upgrades: { name: string; key: string | null; built: boolean }[];
  evidence: z.infer<typeof CapabilityInputSchema>["evidence"];
}

const when = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

export function generationReadinessEngine(raw: CapabilityInput[]) {
  const caps = z.array(CapabilityInputSchema).parse(raw).map((c): CapabilityReadiness => {
    const on = c.backends.filter((b) => b.state === "configured");
    const real = on.filter((b) => b.execution !== "test");
    const e = c.evidence;
    const lastName = c.backends.find((b) => b.id === e.last_success_backend)?.name ?? e.last_success_backend;
    let state: ReadinessState;
    let headline: string;
    if (real.length && e.succeeded > 0) {
      state = "proven";
      headline = `Works — last made ${e.last_success_at ? when(e.last_success_at) : ""} with ${lastName} (${e.succeeded} made in this project${e.failed ? `, ${e.failed} failed` : ""}).`;
    } else if (real.length) {
      state = "ready";
      headline = `Ready with ${real.map((b) => b.name).join(" and ")} — not used in this project yet.`;
    } else if (c.backends.some((b) => b.state === "not_configured")) {
      state = "needs_key";
      const k = c.backends.find((b) => b.state === "not_configured");
      headline = `Built, waiting for a key: add ${k?.key ?? "the provider key"} to switch on ${k?.name}.`;
    } else {
      state = "not_built";
      headline = "Not built yet.";
    }
    return {
      id: c.id, label: c.label, where: c.where, href: c.href, state, headline, evidence: e,
      now: on.map((b) => `${b.name}${b.execution === "native" ? " — built in, free" : b.execution === "test" ? " — test output only" : " — connected (paid)"}${b.quality ? `. ${b.quality}` : ""}`),
      upgrades: c.backends.filter((b) => b.state !== "configured" && b.execution === "external").map((b) => ({ name: b.name, key: b.key, built: b.state !== "not_built" })),
    };
  });
  const count = (s: ReadinessState) => caps.filter((c) => c.state === s).length;
  return {
    capabilities: caps,
    summary: { proven: count("proven"), ready: count("ready"), needs_key: count("needs_key"), not_built: count("not_built"), total: caps.length },
    engine_version: ENGINE_VERSION,
  };
}
