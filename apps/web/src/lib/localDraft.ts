"use client";

// Per-device safety net for unsaved typing. The database stays the only
// source of truth (saved versions); this just keeps work-in-progress if the
// tab closes or the writer navigates away before clicking Save.
// Every access is wrapped: storage can be unavailable (private mode, quotas).

export interface LocalDraft {
  text: string;
  base_version_id: string | null;
  saved_at: string;
}

const key = (scope: string) => `aurastage:draft:${scope}`;

export function readDraft(scope: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key(scope));
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(scope: string, draft: LocalDraft) {
  try {
    window.localStorage.setItem(key(scope), JSON.stringify(draft));
  } catch {
    /* storage unavailable: nothing to do, the in-page text is still there */
  }
}

export function clearDraft(scope: string) {
  try {
    window.localStorage.removeItem(key(scope));
  } catch {
    /* ignore */
  }
}
