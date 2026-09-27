// @aurastage/production-graph
// Typed dependency references + drift detection + impact priority (SRS §14.2,
// docs/architecture/PRODUCTION_GRAPH.md). When an approved artefact freezes the
// exact upstream versions it was derived from, this package compares those
// frozen references with the current upstream state and says which descendants
// must be marked REVIEW_REQUIRED or STALE — it never deletes anything.
// Pure and dependency-free: used by the API, workers and tests alike.

export type DependencyType =
  | "scene" // Scriptwriter scene content (heading + elements)
  | "character" // Casting identity/profile
  | "dialogue_line" // Dialogue Intelligence line (words + annotations + approval)
  | "wardrobe_look" // Casting WardrobeLook
  | "project_technical"; // Project Settings technical/provider policy

/** How strongly a descendant depends on this upstream object. */
export type DependencyStrength =
  | "hard" // the descendant is derived from it: a change makes the descendant STALE
  | "soft"; // the descendant references it: a change needs a person to REVIEW

export interface DependencyRef {
  type: DependencyType;
  id: string;
  /** Opaque content fingerprint of the exact version used (hash, version id…). */
  fingerprint: string;
  strength: DependencyStrength;
  /** Human-readable label for evidence (e.g. "Scene 3", "Tunde Okafor"). */
  label: string;
}

export type DriftKind = "changed" | "removed" | "added";

export interface Drift {
  ref: DependencyRef;
  kind: DriftKind;
  /** Resulting state for the descendant because of this drift. */
  effect: "stale" | "review_required";
  message: string;
}

export type DescendantState = "current" | "review_required" | "stale";

const key = (r: Pick<DependencyRef, "type" | "id">) => `${r.type}:${r.id}`;

const TYPE_NOUN: Record<DependencyType, string> = {
  scene: "scene text",
  character: "character",
  dialogue_line: "dialogue line",
  wardrobe_look: "wardrobe look",
  project_technical: "technical settings",
};

/**
 * Compare frozen dependency refs (captured at approval) with the current state.
 * - changed fingerprint: hard -> stale, soft -> review_required
 * - removed upstream:     hard -> stale, soft -> review_required
 * - added upstream (a new participant/line now belongs to the scene): review_required
 */
export function computeDrift(frozen: DependencyRef[], current: DependencyRef[]): Drift[] {
  const cur = new Map(current.map((r) => [key(r), r]));
  const old = new Map(frozen.map((r) => [key(r), r]));
  const drifts: Drift[] = [];
  for (const f of frozen) {
    const c = cur.get(key(f));
    const effect = f.strength === "hard" ? "stale" : "review_required";
    if (!c) {
      drifts.push({ ref: f, kind: "removed", effect, message: `${f.label} (${TYPE_NOUN[f.type]}) is no longer part of this scene.` });
    } else if (c.fingerprint !== f.fingerprint) {
      drifts.push({ ref: c, kind: "changed", effect, message: `${c.label} (${TYPE_NOUN[c.type]}) changed since approval.` });
    }
  }
  for (const c of current) {
    if (!old.has(key(c))) {
      drifts.push({ ref: c, kind: "added", effect: "review_required", message: `${c.label} (${TYPE_NOUN[c.type]}) was added since approval.` });
    }
  }
  return drifts;
}

/** Worst state implied by a set of drifts (stale > review_required > current). */
export function descendantState(drifts: Drift[]): DescendantState {
  if (drifts.some((d) => d.effect === "stale")) return "stale";
  if (drifts.length > 0) return "review_required";
  return "current";
}

/** SRS §14.2 impact priority I = Σ(c × d × k × a), each factor in [0,1]. */
export interface ImpactFactor {
  criticality: number;
  dependencyStrength: number;
  recomputationCost: number;
  approvalWeight: number;
}
export function impactPriority(factors: ImpactFactor[]): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return factors.reduce(
    (sum, f) => sum + clamp(f.criticality) * clamp(f.dependencyStrength) * clamp(f.recomputationCost) * clamp(f.approvalWeight),
    0
  );
}
