// Any page can hand Ask AuraStage a ready-made request ("Develop Amara's profile…"); the workspace shell opens the panel
// and asks it. The request still becomes a suggestion the user reviews — nothing changes until they apply it.
export const ASK_EVENT = "aura:ask";
export function askAuraStage(text: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text } }));
}
