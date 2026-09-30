// Any page can hand Ask AuraStage a ready-made request ("Develop Amara's profile…"); the workspace shell opens the panel
// and asks it. The request still becomes a suggestion the user reviews — nothing changes until they apply it.
import { useEffect, useRef } from "react";

export const ASK_EVENT = "aura:ask";
/** A page's one-click fill: the built-in engines know exactly what to fill (free; owner, 2026-09-30). */
export type BuiltinTask = "develop_character" | "develop_cast" | "annotate_scene" | "fill_scene_overview" | "fill_visual_sound" | "fill_continuity" | "fill_scene" | "describe_world" | "fill_all_scene_dna" | "annotate_all_lines" | "fill_story" | "fill_settings" | "describe_all_world";
export interface AskRequest { text: string; task?: BuiltinTask; object?: { type: string; id: string; version?: string | null; label?: string } }
export function askAuraStage(text: string, opts: Omit<AskRequest, "text"> = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text, ...opts } }));
}

// After a suggestion is applied or undone, the page underneath re-reads what is stored, so the change shows at once
// (it used to need a manual reload).
export const APPLIED_EVENT = "aura:applied";
export function announceAssistantChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(APPLIED_EVENT));
}
export function useAssistantChanges(reload: () => unknown) {
  const cb = useRef(reload);
  cb.current = reload;
  useEffect(() => {
    const on = () => void Promise.resolve(cb.current()).catch(() => null);
    window.addEventListener(APPLIED_EVENT, on);
    return () => window.removeEventListener(APPLIED_EVENT, on);
  }, []);
}
