// apps/api/src/modules/characters/characters.events.ts
// Domain: Casting & Characters
// Written transactionally into audit_events by the migration-0006 functions.
export const CHARACTER_EVENTS = {
  Synced: "CharactersSynced",
  Updated: "CharacterUpdated",
  AliasAdded: "CharacterAliasAdded",
  Merged: "CharacterMerged",
  Unmerged: "CharacterUnmerged",
} as const;
