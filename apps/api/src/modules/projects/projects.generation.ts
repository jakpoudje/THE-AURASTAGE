// apps/api/src/modules/projects/projects.generation.ts
// Read-only "AI & Generation" readiness (owner, 2026-09-28: "assure me the platform is ready end to end before I pay").
// For every kind of generation: which backends are built and configured on this server (from the Provider Gateway,
// never guessed) and what has actually been made in this project (each domain's own records, read with the caller's
// access). generationReadinessEngine turns that into a state per capability. Writes nothing.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generationReadinessEngine, type generationReadiness } from "@aurastage/engines";
import { audioStatuses, providerStatuses, reasoningStatuses, stillBackendStatuses } from "../../providers";
import { ForbiddenError } from "./projects.permissions";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
type Backend = generationReadiness.CapabilityInput["backends"][number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY: Record<string, string> = { openai: "OPENAI_API_KEY", runway: "RUNWAY_API_KEY", anthropic: "ANTHROPIC_API_KEY", elevenlabs: "ELEVENLABS_API_KEY",
  gemini: "GEMINI_API_KEY", google: "GEMINI_API_KEY", stability: "STABILITY_API_KEY", bfl: "BFL_API_KEY", luma: "LUMA_API_KEY", kling: "KLING_ACCESS_KEY + KLING_SECRET_KEY", minimax: "MINIMAX_API_KEY" };

/** Successes / failures and the latest success in one table, read through the caller's own access (RLS). */
async function evidence(db: SupabaseClient, table: string, projectId: string, filter: (q: any) => any, ok: string[], bad: string[], providerCol = "provider", doneCol = "completed_at") {
  const base = () => filter(db.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId));
  const [s, f, last] = await Promise.all([
    base().in("status", ok), base().in("status", bad),
    filter(db.from(table).select(`${providerCol}, ${doneCol}, status`).eq("project_id", projectId)).in("status", ok).order(doneCol, { ascending: false, nullsFirst: false }).limit(1),
  ]);
  for (const r of [s, f, last]) if (r.error) throw r.error;
  const l = (last.data as Row[] | null)?.[0];
  return { succeeded: s.count ?? 0, failed: f.count ?? 0, last_success_at: l?.[doneCol] ?? null, last_success_backend: l?.[providerCol] ?? null, last_error: null };
}
const b = (id: string, name: string, execution: Backend["execution"], state: Backend["state"], quality = ""): Backend =>
  ({ id, name, execution, state, key: execution === "external" ? KEY[id] ?? null : null, quality });

export async function getGenerationReadiness(db: SupabaseClient, projectId: string, env: Env = process.env) {
  if (!UUID.test(projectId)) throw new ForbiddenError("Project not found");
  const { data: project, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!project) throw new ForbiddenError("Project not found");

  const vis = providerStatuses(env);
  const visFor = (cap: "image" | "video") => vis.filter((p) => p.capabilities.includes(cap)).map((p) =>
    b(p.id, p.name, p.id === "aurastage-sketch" ? "native" : "external", p.state === "configured" ? "configured" : "not_configured",
      p.id === "aurastage-sketch" ? "Labelled storyboard sketches, not AI — for layout and blocking." : ""));
  // The built-in story intelligence always runs (free); paid writers (Claude…) are optional refinements.
  const reasoning = [b("aurastage", "AuraStage story intelligence (built in)", "native", "configured", "Fills every field from the script with AuraStage's own engines — free."),
    ...reasoningStatuses(env).map((r) => b(r.id, r.name, r.execution === "test" ? "test" : "external", r.state === "configured" ? "configured" : "not_configured"))];
  const refs = stillBackendStatuses(env).map((r) => b(r.id, r.name, r.id === "aurastage-sketch" ? "native" : "external", r.state as Backend["state"], r.id === "aurastage-sketch" ? "Labelled reference sketches, not AI." : ""));
  const audioFor = (kind: "fx" | "score" | "voice") => audioStatuses(env).filter((a) => a.kinds.includes(kind)).map((a) =>
    b(a.id, a.name, a.execution === "native" ? "native" : "external", a.state as Backend["state"],
      a.execution !== "native" ? "" : a.id === "aurastage-neural-voice" ? "Natural neural speech matched to each character's Voice DNA — free, no acting range beyond pace and energy."
        : kind === "voice" ? "Robotic fallback speech — good for timing." : "Synthesised placeholder sound — good for timing and testing."));
  const planned = (id: string, name: string) => b(id, name, "external", "not_built");

  const [assistant, stills, videos, looks, worldRefs, sounds, music, voices, renders] = await Promise.all([
    evidence(db, "ai_proposals", projectId, (q) => q.not("provider", "is", null), ["proposed", "applied", "rejected", "undone"], ["failed"], "provider", "planned_at"),
    evidence(db, "takes", projectId, (q) => q.eq("capability", "image"), ["succeeded"], ["failed"]),
    evidence(db, "takes", projectId, (q) => q.eq("capability", "video"), ["succeeded"], ["failed"]),
    evidence(db, "character_reference_images", projectId, (q) => q, ["succeeded"], ["failed"]),
    evidence(db, "world_reference_images", projectId, (q) => q, ["succeeded"], ["failed"]),
    evidence(db, "audio_generations", projectId, (q) => q.in("kind", ["ambience", "fx", "foley"]), ["succeeded"], ["failed"]),
    evidence(db, "audio_generations", projectId, (q) => q.eq("kind", "score"), ["succeeded"], ["failed"]),
    evidence(db, "audio_generations", projectId, (q) => q.eq("kind", "voice"), ["succeeded"], ["failed"]),
    evidence(db, "renders", projectId, (q) => q, ["succeeded"], ["failed"], "profile_id"),
  ]);
  const P = `/projects/${projectId}`;
  const out = generationReadinessEngine([
    { id: "assistant", label: "Ask AuraStage (story & production assistant)", where: "Every workspace (top bar)", href: `${P}/scriptwriter`, backends: reasoning, evidence: assistant },
    { id: "storyboard", label: "Storyboard frames & still images", where: "Visual Generation", href: `${P}/visual`, backends: visFor("image"), evidence: stills },
    { id: "character_refs", label: "Character reference views", where: "Casting → Look & References", href: `${P}/casting`, backends: refs, evidence: looks },
    { id: "world_refs", label: "Location & prop reference views", where: "Locations & Props", href: `${P}/world`, backends: refs.map((x) => x.id === "aurastage-sketch" ? { ...x, quality: "Labelled location and prop sketches, not AI." } : x), evidence: worldRefs },
    { id: "video", label: "Video clips", where: "Visual Generation", href: `${P}/visual`, backends: [...visFor("video"), planned("aurastage-animatic", "AuraStage animatic (built in)")].map((x) => x.id === "aurastage-animatic" ? { ...x, execution: "native" as const } : x), evidence: videos },
    { id: "sound", label: "Sound effects, Foley & ambience", where: "Audio Studio", href: `${P}/audio`, backends: [...audioFor("fx"), planned("elevenlabs", "ElevenLabs sound effects")], evidence: sounds },
    { id: "music", label: "Music & score", where: "Audio Studio", href: `${P}/audio`, backends: [...audioFor("score"), planned("music-provider", "Music provider (official API)")], evidence: music },
    { id: "voice", label: "Dialogue voices (text-to-speech)", where: "Audio Studio", href: `${P}/audio`, backends: [...audioFor("voice"), planned("elevenlabs", "ElevenLabs voices")], evidence: voices },
    { id: "delivery", label: "Rendering deliverables (MP4, subtitles, audio)", where: "Export & Deliver", href: `${P}/export`, backends: [b("render-worker", "AuraStage render worker (ffmpeg)", "native", "configured")], evidence: renders },
  ]);
  return out;
}
