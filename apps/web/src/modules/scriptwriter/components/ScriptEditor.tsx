"use client";

// Edit & Refine: plain-text screenplay (Fountain conventions) with a live
// formatted preview. Saving creates a new immutable version; approving pins
// the saved version and derives the canonical scene list from it.

import { useState } from "react";
import type { ScreenplayElement } from "@aurastage/contracts";
import { ScreenplayPreview } from "./ScreenplayPreview";

const STARTER = `INT. TUNDE'S APARTMENT - NIGHT

Rain lashes the window. TUNDE OKAFOR (35) hunches over a laptop.

TUNDE
(to himself)
They buried it. But not deep enough.

EXT. LAGOS HARBOUR - DAWN

AMARA BELLO waits by the water.

AMARA
You came.
`;

export function ScriptEditor({
  draft,
  setDraft,
  elements,
  dirty,
  busy,
  canApprove,
  approved,
  onSave,
  onApprove,
}: {
  draft: string;
  setDraft: (v: string) => void;
  elements: ScreenplayElement[];
  dirty: boolean;
  busy: null | string;
  canApprove: boolean;
  approved: boolean;
  onSave: (note?: string) => void;
  onApprove: () => void;
}) {
  const [view, setView] = useState<"write" | "preview">("write");
  const [note, setNote] = useState("");

  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-aura-border px-4 py-2">
        <h2 className="mr-auto font-display text-lg">Script Editor</h2>
        {(["write", "preview"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1 text-xs capitalize ${view === v ? "bg-aura-gold/15 text-aura-gold" : "text-white/60"}`}
          >
            {v}
          </button>
        ))}
        <span className={`text-xs ${dirty ? "text-aura-gold" : "text-white/40"}`}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>

      {view === "write" ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder={"Start with a scene heading, e.g.\n\nINT. KITCHEN - NIGHT\n\nAction lines describe what we see.\n\nCHARACTER NAME\nDialogue goes under the name."}
            className="block h-[60vh] w-full resize-y bg-black/30 p-5 font-mono text-[13px] leading-relaxed outline-none"
          />
          {draft.trim() === "" && (
            <button onClick={() => setDraft(STARTER)} className="m-4 text-xs text-aura-gold underline">
              Insert a short example to see how it works
            </button>
          )}
        </div>
      ) : (
        <div className="h-[60vh] overflow-y-auto bg-black/30 px-8 py-4">
          <ScreenplayPreview elements={elements} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-aura-border px-4 py-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Version note (optional)"
          className="min-w-0 flex-1 rounded-md border border-aura-border bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-aura-gold"
        />
        <button
          onClick={() => {
            onSave(note);
            setNote("");
          }}
          disabled={!dirty || busy !== null}
          className="rounded-md border border-aura-gold/60 px-4 py-1.5 text-sm text-aura-gold disabled:opacity-40"
        >
          {busy === "save" ? "Saving…" : "Save version"}
        </button>
        <button
          onClick={onApprove}
          disabled={!canApprove || dirty || busy !== null}
          title={dirty ? "Save your changes first" : approved ? "This version is already approved" : undefined}
          className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy === "approve" ? "Approving…" : approved ? "Approved ✓" : "Approve script"}
        </button>
      </div>
    </div>
  );
}
