// apps/api/src/modules/dialogue/dialogue.events.ts
// Written transactionally into audit_events by the migration-0010 functions.
export const DIALOGUE_EVENTS = {
  Synced: "DialogueSynced",
  LineUpdated: "DialogueLineUpdated",
  LineApproved: "DialogueLineApproved",
  SceneApproved: "SceneDialogueApproved",
} as const;
