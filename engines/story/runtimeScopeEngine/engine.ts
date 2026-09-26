// engines/story/runtimeScopeEngine
// SRS §5.1: builds a ScopePlan from target runtime R using N_scene ≈ R / μ_scene,
// where μ_scene is a genre prior the user can override. Act budgets sum to R.

import type { ScopePlan } from "@aurastage/contracts";
import { meanSceneMinutesFor, PAGE_TOLERANCE, THREE_ACT_SPLIT } from "./rules";
import { validateRuntimeScopeInput } from "./validator";

export function runtimeScopeEngine(rawInput: unknown): ScopePlan {
  const input = validateRuntimeScopeInput(rawInput);
  const R = input.target_runtime_minutes;
  const prior = meanSceneMinutesFor(input.genre);
  const mu = input.mean_scene_minutes_override ?? prior.minutes;
  const N = Math.max(1, Math.round(R / mu));

  // Distribute minutes and scenes across acts; the last act absorbs rounding so totals match exactly.
  let minutesLeft = R;
  let scenesLeft = N;
  const acts = THREE_ACT_SPLIT.map((a, i) => {
    const last = i === THREE_ACT_SPLIT.length - 1;
    const minutes = last ? minutesLeft : Math.round(R * a.share * 10) / 10;
    const scenes = last ? scenesLeft : Math.round(N * a.share);
    minutesLeft = Math.round((minutesLeft - minutes) * 10) / 10;
    scenesLeft -= scenes;
    return { act: a.act, label: a.label, minutes, scenes };
  });

  const basis = input.mean_scene_minutes_override
    ? `Your override of ${mu} min per scene.`
    : prior.matched
      ? `Typical ${prior.matched} pacing of about ${mu} min per scene.`
      : `A general default of ${mu} min per scene (no genre prior matched).`;

  return {
    target_runtime_minutes: R,
    mean_scene_minutes: mu,
    estimated_scene_count: N,
    estimated_pages: {
      min: Math.round(R * (1 - PAGE_TOLERANCE)),
      max: Math.round(R * (1 + PAGE_TOLERANCE)),
    },
    acts,
    basis,
  };
}
