// engines/cinematography/coverageMathEngine
// SRS §9.1 coverage mathematics: story duration and source coverage differ.
// Alternate setups overlap, so coverage is the measure of the UNION of the
// planned story-time intervals over Tₛ — not the sum of shot durations.
// Mandatory dialogue beats are constraints checked by id.

import type { ReadinessPredicate } from "@aurastage/contracts";
import { GAP_EPSILON, LONG_SHOT_SECONDS, MIN_COVERAGE } from "./rules";
import { validateCoverageInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { CoverageOutput } from "./output.schema";

const round = (x: number) => Math.round(x * 100) / 100;

export function coverageMathEngine(raw: unknown): CoverageOutput {
  const input = validateCoverageInput(raw);
  const T = input.scene_seconds;
  const intervals = input.shots
    .map((s) => [Math.max(0, Math.min(T, s.story_start)), Math.max(0, Math.min(T, s.story_end))] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  const merged: [number, number][] = [];
  for (const [a, b] of intervals) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + GAP_EPSILON) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const covered = merged.reduce((s, [a, b]) => s + (b - a), 0);
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a - cursor > GAP_EPSILON) gaps.push({ start: round(cursor), end: round(a) });
    cursor = Math.max(cursor, b);
  }
  if (T - cursor > GAP_EPSILON) gaps.push({ start: round(cursor), end: round(T) });
  const coverage = Math.min(1, covered / T);

  const coveredLines = new Set(input.shots.flatMap((s) => s.dialogue_line_ids));
  const uncovered = input.line_ids.filter((id) => !coveredLines.has(id));
  const seen = new Set(input.shots.flatMap((s) => s.character_ids));
  const unseen = input.characters.filter((c) => !seen.has(c.id)).map((c) => c.name);
  const long = input.shots.filter((s) => s.duration_seconds > LONG_SHOT_SECONDS).map((s) => s.ordinal);
  const hasEstablishing = input.shots.some((s) => s.purpose === "establishing" || s.purpose === "master");
  const label = (id: string) => input.line_labels[id] ?? id;
  const fmt = (x: number) => `${round(x)}s`;

  const readiness: ReadinessPredicate[] = [
    {
      id: "has_shots",
      label: "The scene has at least one shot",
      ok: input.shots.length > 0,
      blocking: true,
      evidence: `${input.shots.length} shot${input.shots.length === 1 ? "" : "s"}`,
    },
    {
      id: "dialogue_covered",
      label: "Every dialogue line is covered by a shot",
      ok: uncovered.length === 0,
      blocking: true,
      evidence: uncovered.length ? `Not covered: ${uncovered.map(label).join("; ").slice(0, 300)}` : `${input.line_ids.length} of ${input.line_ids.length} lines covered`,
    },
    {
      id: "story_time_covered",
      label: `Scene story time covered (at least ${Math.round(MIN_COVERAGE * 100)}%)`,
      ok: coverage >= MIN_COVERAGE,
      blocking: true,
      evidence: `${fmt(covered)} of ${fmt(T)} covered${gaps.length ? `; gaps ${gaps.map((g) => `${g.start}–${g.end}s`).join(", ")}` : ""}`,
    },
    {
      id: "establishing",
      label: "An establishing or master shot orients the audience",
      ok: hasEstablishing,
      blocking: false,
      evidence: hasEstablishing ? "Present" : "No establishing or master shot",
    },
    {
      id: "characters_seen",
      label: "Every on-screen character appears in a shot",
      ok: unseen.length === 0,
      blocking: false,
      evidence: unseen.length ? `Never in frame: ${unseen.join(", ")}` : `${input.characters.length} character${input.characters.length === 1 ? "" : "s"} seen`,
    },
    {
      id: "shot_lengths",
      label: `No single shot longer than ${LONG_SHOT_SECONDS}s`,
      ok: long.length === 0,
      blocking: false,
      evidence: long.length ? `Long: shot ${long.join(", ")}` : "All within range",
    },
  ];

  return {
    coverage: round(coverage),
    covered_seconds: round(covered),
    gaps,
    uncovered_lines: uncovered,
    unseen_characters: unseen,
    screen_seconds: round(input.shots.reduce((s, x) => s + x.duration_seconds, 0)),
    shot_count: input.shots.length,
    readiness,
    ready_for_approval: readiness.filter((r) => r.blocking).every((r) => r.ok),
    engine_version: ENGINE_VERSION,
  };
}
