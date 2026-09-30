// Whole-cast profiles (owner request 2026-09-30): one click to use what the script and story already suggest for every
// character (free, built in; only empty fields), and one click to develop every remaining field with AI (a suggestion
// shown before → after in Ask AuraStage; nothing changes until you apply it). Then "what's next" once the cast is done.
import Link from "next/link";
import type { Character } from "@aurastage/contracts";
import { askAuraStage } from "@/modules/ask-aurastage/askBus";
import { emptyFields, isComplete } from "../state/completeness";
import { LABELS } from "./CharacterProfile";

export function CastProfilesBar({ projectId, characters, busy, onApplySuggestions }: {
  projectId: string; characters: Character[]; busy: boolean; onApplySuggestions: () => void;
}) {
  const incomplete = characters.filter((c) => emptyFields(c as never).length > 0);
  const drafts = characters.filter((c) => c.status !== "approved");
  const done = characters.length > 0 && characters.every(isComplete);
  const develop = () =>
    askAuraStage(
      `Develop every character's profile in one pass: for ${incomplete.map((c) => `${c.name} (${emptyFields(c as never).map((k) => LABELS[k].toLowerCase()).join(", ")})`).join("; ")} — fill only the empty fields, from the script and the story, including the accent and languages the story suggests. Keep everything already written.`,
    );
  return (
    <section aria-label="Whole cast profiles" className="rounded-xl border border-aura-border bg-aura-panel p-4">
      {done ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-emerald-300">Every character is complete and approved.</span>
          <Link href={`/projects/${projectId}/world`} className="rounded-md bg-aura-gold px-3 py-1.5 text-sm font-medium text-black">Next: Locations & Props →</Link>
        </div>
      ) : (
        <>
          <h2 className="text-sm font-medium">Profiles for the whole cast</h2>
          <p className="mt-1 text-xs text-white/50">
            {incomplete.length ? `${incomplete.length} of ${characters.length} characters have empty fields` : "Every field is filled in"}
            {drafts.length ? ` · ${drafts.length} not approved yet` : ""}. Nothing you've written is changed.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={onApplySuggestions} disabled={busy || !incomplete.length}
              className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40">
              Use suggested profiles for the whole cast
            </button>
            <span className="text-[11px] text-white/40">Free — ages and descriptions from the script, accents and languages from the story.</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={develop} disabled={busy || !incomplete.length}
              className="rounded-md bg-aura-gold px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40">
              Develop the rest of every profile with AI
            </button>
            <span className="text-[11px] text-white/40">Uses AI writing. You see every change before it's saved, and can undo it.</span>
          </div>
        </>
      )}
    </section>
  );
}
