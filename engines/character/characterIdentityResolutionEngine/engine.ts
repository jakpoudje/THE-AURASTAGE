// engines/character/characterIdentityResolutionEngine
// SRS §6.2: resolves script candidates against canonical characters so the
// same person is never created twice. Exact normalised name/alias matches are
// decisive; a match on a merged character follows the merge. Low-confidence
// candidates wait for a person unless they already exist or were confirmed.

import { normalizeCharacterName } from "@aurastage/contracts";
import { validateIdentityResolutionInput } from "./validator";
import { ENGINE_VERSION } from "./version";
import type { IdentityResolutionOutput, Resolution } from "./output.schema";

export function characterIdentityResolutionEngine(rawInput: unknown): IdentityResolutionOutput {
  const { candidates, existing, confirmed_keys } = validateIdentityResolutionInput(rawInput);
  const byId = new Map(existing.map((c) => [c.id, c]));
  const follow = (id: string) => {
    let c = byId.get(id);
    const seen = new Set<string>();
    while (c?.merged_into && !seen.has(c.id)) {
      seen.add(c.id);
      c = byId.get(c.merged_into) ?? c;
    }
    return c?.id ?? id;
  };
  const nameIndex = new Map<string, string>();
  const aliasIndex = new Map<string, string>();
  for (const c of existing) {
    nameIndex.set(normalizeCharacterName(c.name), c.id);
    for (const a of c.aliases) aliasIndex.set(normalizeCharacterName(a), c.id);
  }
  const confirmed = new Set(confirmed_keys);

  const resolutions: Resolution[] = candidates.map((candidate) => {
    const keys = [candidate.key, ...candidate.aliases.map(normalizeCharacterName)];
    for (const k of keys) {
      const byName = nameIndex.get(k);
      if (byName) return { candidate, decision: "match", character_id: follow(byName), via: "name" };
    }
    for (const k of keys) {
      const byAlias = aliasIndex.get(k);
      if (byAlias) return { candidate, decision: "match", character_id: follow(byAlias), via: "alias" };
    }
    if (candidate.needs_confirmation && !confirmed.has(candidate.key)) {
      return { candidate, decision: "confirm", character_id: null, via: "none" };
    }
    return { candidate, decision: "create", character_id: null, via: "none" };
  });

  return { resolutions, engine_version: ENGINE_VERSION };
}
