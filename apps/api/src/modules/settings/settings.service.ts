// Project Settings (SRS §13.1): read, preview the impact of a change, save a new version.
// Changes apply to new work; nothing approved is rewritten (rule 11). The preview says exactly
// what each change will and won't touch, from real counts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOUDNESS_STANDARDS, ProjectSettingsSchema, SaveProjectSettingsInputSchema, loudnessTarget, type ProjectSettings } from "@aurastage/contracts";
import { deliveryProfiles } from "@aurastage/engines";
import { providerStatuses } from "../../providers";
import * as repo from "./settings.repository";
import { readProjectSettings } from "./settings.read";
import { SettingsNotFoundError, changedPaths, parse } from "./settings.validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Env = Record<string, string | undefined>;

/** Parts of the pipeline that are fixed today; shown as facts, not settings (rule 12). */
export const PIPELINE_FACTS = [
  { id: "timebase", label: "Timebase", value: "24 fps", reason: "Editorial, subtitles and every deliverable are built on a 24 fps timeline." },
  { id: "colour", label: "Colour space", value: "Rec.709 (SDR)", reason: "Deliverables are encoded and flagged BT.709; HDR mastering isn't built yet." },
  { id: "resolution", label: "Master resolution", value: "1920×1080", reason: "Set by the delivery presets; 4K masters aren't built yet." },
  { id: "audio", label: "Audio", value: "48 kHz stereo", reason: "Audio Studio mixes and every deliverable use 48 kHz stereo." },
];

async function assertProject(db: SupabaseClient, projectId: string) {
  if (!UUID.test(projectId)) throw new SettingsNotFoundError("Project not found");
  const p = await repo.getProject(db, projectId);
  if (!p) throw new SettingsNotFoundError("Project not found");
  return p;
}

export async function getSettings(db: SupabaseClient, projectId: string, env: Env = process.env) {
  const project = await assertProject(db, projectId);
  const [current, versions, paid] = await Promise.all([readProjectSettings(db, projectId), repo.listVersions(db, projectId), repo.paidTakesThisMonth(db, projectId)]);
  return {
    ...current,
    story: {
      title: project.title, type: project.type, genre: project.genre, subgenre: project.subgenre, setting: project.setting, time_period: project.time_period,
      logline: project.logline, tone: project.tone, target_runtime_minutes: project.target_runtime_minutes,
    },
    facts: PIPELINE_FACTS,
    loudness_standards: Object.entries(LOUDNESS_STANDARDS).map(([id, v]) => ({ id, ...v })),
    providers: providerStatuses(env).map((p) => ({ id: p.id, name: p.name, capabilities: p.capabilities, state: p.state })),
    delivery_profiles: deliveryProfiles().filter((p) => p.available).map((p) => ({ id: p.id, name: p.label })),
    paid_takes_this_month: paid,
    versions,
  };
}

type Impact = { path: string; label: string; effect: string };

/** What saving these settings would change, and what it leaves alone. */
export async function previewImpact(db: SupabaseClient, projectId: string, payload: unknown): Promise<{ changed: string[]; impact: Impact[] }> {
  await assertProject(db, projectId);
  const next = parse(ProjectSettingsSchema, (payload as { settings?: unknown })?.settings);
  const { settings: cur } = await readProjectSettings(db, projectId);
  const changed = changedPaths(cur, next);
  const impact: Impact[] = [];
  const has = (prefix: string) => changed.some((c) => c === prefix || c.startsWith(prefix + "."));
  if (has("style.look") || has("style.palette")) {
    const n = await repo.count(db, "generation_packages", projectId);
    impact.push({ path: "style", label: "Visual style", effect: n
      ? `${n} compiled shot prompt${n === 1 ? "" : "s"} will be marked for review so you can recompile them with the new look. Approved takes are kept.`
      : "New shot prompts will use it. Nothing compiled yet." });
  }
  if (has("technical.aspect_ratio")) {
    impact.push({ path: "technical.aspect_ratio", label: "Frame shape", effect: `New shot prompts default to ${next.technical.aspect_ratio}. Prompts already compiled keep their frame shape.` });
  }
  if (has("technical.loudness_standard")) {
    const t = loudnessTarget(next.technical.loudness_standard);
    const approved = await repo.count(db, "audio_sessions", projectId, { status: "approved" });
    impact.push({ path: "technical.loudness_standard", label: "Loudness standard",
      effect: `Audio Studio and deliverable QC will check ${t.integrated_lufs} LUFS ±${t.tolerance_lu}. ${approved} approved scene mix${approved === 1 ? " stays" : "es stay"} approved — the check is advisory and mixes are never re-levelled automatically.` });
  }
  if (has("generation.monthly_paid_take_limit")) {
    const used = await repo.paidTakesThisMonth(db, projectId);
    const lim = next.generation.monthly_paid_take_limit;
    impact.push({ path: "generation.monthly_paid_take_limit", label: "Monthly paid takes",
      effect: lim === null ? "No monthly cap on paid generations." : `${used} of ${lim} paid takes used this month.${used >= lim ? " New paid takes will be refused until next month." : ""}` });
  }
  if (has("generation.default_image_provider") || has("generation.default_video_provider")) {
    impact.push({ path: "generation", label: "Default providers", effect: "Visual Generation preselects them. Nothing already generated changes." });
  }
  if (has("delivery.required_profiles")) {
    impact.push({ path: "delivery.required_profiles", label: "Required deliverables", effect: `Export & Deliver will track ${next.delivery.required_profiles.length} required deliverable${next.delivery.required_profiles.length === 1 ? "" : "s"}.` });
  }
  if (has("production")) {
    impact.push({ path: "production", label: "Credits", effect: "Written into files rendered from now on (and the end credits, when they're on). Files already rendered keep what they have." });
  }
  if (has("titles")) {
    const t = next.titles;
    const parts = [t.opening_title ? `start with a ${t.opening_seconds}-second title card` : null, t.end_credits ? "end with a credits roll" : null].filter(Boolean);
    impact.push({ path: "titles", label: "Titles & credits", effect: parts.length
      ? `Video deliverables rendered from now on ${parts.join(" and ")}. The Picture Lock itself doesn't change.`
      : "Video deliverables rendered from now on have no title card or credits." });
  }
  return { changed, impact };
}

export async function saveSettings(db: SupabaseClient, projectId: string, payload: unknown) {
  await assertProject(db, projectId);
  const input = parse(SaveProjectSettingsInputSchema, payload);
  const { settings: cur } = await readProjectSettings(db, projectId);
  const changed = changedPaths(cur, input.settings as ProjectSettings);
  await repo.save(db, projectId, input.base_revision, input.settings, changed);
  return getSettings(db, projectId);
}
