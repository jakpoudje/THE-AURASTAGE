"use client";

// One dialogue line (UI_REFERENCE §5): speaker, text, timecode, emotion and
// intent pickers, subtext and notes. Text is read-only here — the words are
// owned by Scriptwriter; Dialogue owns their meaning and delivery.

import { useState } from "react";
import { DIALOGUE_INTENTION_SUGGESTIONS, DialogueEmotionSchema, type DialogueLine, type UpdateDialogueLineInput } from "@aurastage/contracts";

const EMOTIONS = DialogueEmotionSchema.options;
const field = "w-full rounded-md border border-aura-border bg-black/40 px-2 py-1 text-sm outline-none focus:border-aura-gold";

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LineCard({
  line,
  startSeconds,
  speakerName,
  listenerNames,
  busy,
  onSave,
}: {
  line: DialogueLine;
  startSeconds: number;
  speakerName: string;
  listenerNames: string[];
  busy: boolean;
  onSave: (input: UpdateDialogueLineInput, message?: string) => void;
}) {
  const [intention, setIntention] = useState(line.intention ?? "");
  const [emotion, setEmotion] = useState(line.emotion ?? "");
  const [intensity, setIntensity] = useState<number | "">(line.intensity ?? "");
  const [subtext, setSubtext] = useState(line.subtext ?? "");
  const [notes, setNotes] = useState(line.notes ?? "");
  const [open, setOpen] = useState(false);

  const patch: UpdateDialogueLineInput = {};
  if (intention.trim() !== (line.intention ?? "")) patch.intention = intention.trim() || null;
  if (emotion !== (line.emotion ?? "")) patch.emotion = (emotion || null) as UpdateDialogueLineInput["emotion"];
  if (intensity !== (line.intensity ?? "")) patch.intensity = intensity === "" ? null : intensity;
  if (subtext.trim() !== (line.subtext ?? "")) patch.subtext = subtext.trim() || null;
  if (notes.trim() !== (line.notes ?? "")) patch.notes = notes.trim() || null;
  const dirty = Object.keys(patch).length > 0;
  const omitted = line.status === "omitted";

  return (
    <li className={`rounded-lg border p-3 ${line.review_state === "review_required" ? "border-aura-gold/50" : "border-aura-border"} ${omitted ? "opacity-50" : ""} bg-black/30`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-aura-gold/15 font-display text-aura-gold">{speakerName.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-sm text-white">{speakerName}</span>
            {line.extensions.length > 0 && <span className="text-white/40">({line.extensions.join(", ")})</span>}
            {!line.character_id && <span className="rounded bg-white/5 px-1.5 text-[10px] uppercase text-white/40">not in Casting</span>}
            <span className="text-white/30">{fmt(startSeconds)} · {line.estimated_seconds}s</span>
            {listenerNames.length > 0 && <span className="text-white/30">to {listenerNames.join(", ")}</span>}
            <span className="ml-auto flex items-center gap-2">
              {omitted && <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase text-white/50">No longer in script</span>}
              {line.review_state === "review_required" && <span className="rounded-full border border-aura-gold/60 px-2 py-0.5 text-[10px] uppercase text-aura-gold">Review</span>}
              {line.approval === "approved" && <span className="rounded-full border border-emerald-400/50 px-2 py-0.5 text-[10px] uppercase text-emerald-300">Approved</span>}
            </span>
          </div>
          {line.parenthetical && <p className="mt-1 text-xs italic text-white/50">{line.parenthetical}</p>}
          <p className="mt-1 text-[15px] leading-snug">{line.text}</p>
          {line.previous_text && (
            <p className="mt-1 text-xs text-aura-gold/80">
              Was: <span className="line-through">{line.previous_text}</span> — the script changed after this line was annotated.
            </p>
          )}

          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_140px]">
            <label className="block text-[11px] uppercase tracking-wider text-white/40">
              Intent
              <input list="dialogue-intents" value={intention} onChange={(e) => setIntention(e.target.value)} maxLength={200} disabled={omitted} className={`${field} mt-0.5 normal-case tracking-normal`} placeholder="e.g. confess" />
            </label>
            <label className="block text-[11px] uppercase tracking-wider text-white/40">
              Emotion
              <select value={emotion} onChange={(e) => setEmotion(e.target.value)} disabled={omitted} className={`${field} mt-0.5 normal-case tracking-normal capitalize`}>
                <option value="" className="bg-aura-panel">—</option>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e} className="bg-aura-panel capitalize">{e}</option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] uppercase tracking-wider text-white/40">
              Intensity {intensity === "" ? "" : `${intensity}/10`}
              <input type="range" min={0} max={10} value={intensity === "" ? 5 : intensity} onChange={(e) => setIntensity(Number(e.target.value))} disabled={omitted} aria-label="Intensity" className="mt-2 w-full accent-[#e8b84b]" />
            </label>
          </div>
          {open ? (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <textarea value={subtext} onChange={(e) => setSubtext(e.target.value)} rows={2} maxLength={2000} disabled={omitted} placeholder="Subtext — what they really mean" aria-label="Subtext" className={field} />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={4000} disabled={omitted} placeholder="Performance notes" aria-label="Notes" className={field} />
            </div>
          ) : (
            (line.subtext || line.notes) && (
              <p className="mt-2 text-xs text-white/60">
                {line.subtext && <span>Subtext: {line.subtext} </span>}
                {line.notes && <span className="text-white/40">· Notes: {line.notes}</span>}
              </p>
            )
          )}

          {omitted && line.review_state === "review_required" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-white/50">This line was annotated or approved before it was cut from the script.</span>
              <button onClick={() => onSave({ acknowledge_review: true }, "Marked as reviewed.")} disabled={busy} className="ml-auto rounded-md border border-aura-gold/60 px-3 py-1 text-xs text-aura-gold disabled:opacity-40">
                Mark reviewed
              </button>
            </div>
          )}
          {!omitted && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => setOpen((o) => !o)} className="text-xs text-white/50 hover:text-white">
                {open ? "Hide subtext & notes" : "Subtext & notes"}
              </button>
              <span className="ml-auto flex gap-2">
                {line.review_state === "review_required" && (
                  <button onClick={() => onSave({ acknowledge_review: true }, "Marked as reviewed.")} disabled={busy} className="rounded-md border border-aura-gold/60 px-3 py-1 text-xs text-aura-gold disabled:opacity-40">
                    Mark reviewed
                  </button>
                )}
                <button onClick={() => onSave(patch)} disabled={!dirty || busy} className="rounded-md border border-aura-border px-3 py-1 text-xs disabled:opacity-40">
                  Save
                </button>
                <button
                  onClick={() => onSave({ ...patch, approval: line.approval === "approved" && !dirty ? "draft" : "approved" }, line.approval === "approved" && !dirty ? "Line reopened." : "Line approved.")}
                  disabled={busy}
                  className="rounded-md bg-aura-gold px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
                >
                  {line.approval === "approved" && !dirty ? "Reopen" : dirty ? "Save & approve" : "Approve"}
                </button>
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function IntentSuggestions() {
  return (
    <datalist id="dialogue-intents">
      {DIALOGUE_INTENTION_SUGGESTIONS.map((i) => (
        <option key={i} value={i} />
      ))}
    </datalist>
  );
}
