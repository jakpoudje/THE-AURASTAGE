// apps/api/src/providers/promptFor.ts
// The prompt one provider receives (realism R1): the package's ranked blocks composed to that provider's own length
// limit — the lowest-ranked details are shortened or left out first, never who is in frame or what they do — instead
// of cutting the end off a long prompt. Video models get the video prompt (timed action, lip-synced dialogue).
// Packages compiled before 2.0.0 have no blocks: their single prompt is shortened at a sentence boundary.
import { promptCompiler } from "@aurastage/engines";
import type { GenerationPackageContent, ProviderCapability } from "@aurastage/contracts";

export function promptFor(pkg: GenerationPackageContent, capability: ProviderCapability, max: number): string {
  const mode = capability === "video" ? "video" : "image";
  if (pkg.blocks?.length) return promptCompiler.composePrompt(pkg.blocks as promptCompiler.PromptBlock[], mode, max).text;
  const text = mode === "video" && pkg.video_prompt ? pkg.video_prompt : pkg.prompt;
  return text.length > max ? promptCompiler.shorten(text, max) : text;
}

/** A prompt with a fixed lead (which reference image is which) and tail ("Avoid: …") that fits `max` in total. */
export function framedPrompt(pkg: GenerationPackageContent, capability: ProviderCapability, max: number, lead = "", tail = ""): string {
  const room = Math.max(200, max - lead.length - tail.length - 1);
  const t = tail && lead.length + room + tail.length + 1 > max ? "" : tail; // the avoid-list is the first thing to go
  return `${lead}${promptFor(pkg, capability, t ? room : max - lead.length)}${t ? ` ${t}` : ""}`.slice(0, max);
}

export const avoid = (pkg: GenerationPackageContent) => (pkg.negative.length ? `Avoid: ${pkg.negative.join("; ")}.` : "");
