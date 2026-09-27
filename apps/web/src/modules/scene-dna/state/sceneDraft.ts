"use client";

// Per-device safety net for unsaved Scene DNA edits (the database stays the
// source of truth). Every access is wrapped: storage can be unavailable.
import type { SceneDnaEditable } from "@aurastage/contracts";

const key = (sceneId: string) => `aurastage:scene-dna:${sceneId}`;

export function readSceneDraft(sceneId: string): SceneDnaEditable | null {
  try {
    const raw = window.localStorage.getItem(key(sceneId));
    return raw ? (JSON.parse(raw) as SceneDnaEditable) : null;
  } catch {
    return null;
  }
}
export function writeSceneDraft(sceneId: string, value: SceneDnaEditable) {
  try {
    window.localStorage.setItem(key(sceneId), JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
export function clearSceneDraft(sceneId: string) {
  try {
    window.localStorage.removeItem(key(sceneId));
  } catch {
    /* ignore */
  }
}
