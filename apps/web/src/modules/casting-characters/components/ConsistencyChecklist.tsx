// Character Consistency (UI_REFERENCE §4). Each tick is a real predicate over
// stored data (CLAUDE.md rule 12) — no decorative percentages.
import type { Character, CharacterAppearance } from "@aurastage/contracts";

export function ConsistencyChecklist({ character, appearances }: { character: Character; appearances: CharacterAppearance[] }) {
  const mine = appearances.filter((a) => a.character_id === character.id);
  const checks = [
    { ok: mine.length > 0, label: "Appears in the approved script", hint: "Not found in any approved scene" },
    { ok: !!character.description?.trim(), label: "Has a description", hint: "Add a short description" },
    { ok: character.kind === "group" || !!character.age?.trim(), label: "Age set", hint: "Add an age or age range" },
    {
      ok: character.role === "extra" || character.role === "minor" || !!character.personality?.trim() || !!character.motivation?.trim(),
      label: "Personality or motivation written",
      hint: "Main roles need personality or motivation",
    },
    { ok: character.status === "approved", label: "Approved", hint: "Approve when the profile is ready" },
  ];
  const done = checks.filter((c) => c.ok).length;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="text-xs uppercase tracking-widest text-aura-gold">Character Consistency</h3>
      <p className="mt-1 text-xs text-white/50">
        {done} of {checks.length} checks passed
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2">
            <span className={c.ok ? "text-emerald-400" : "text-white/30"}>{c.ok ? "✓" : "○"}</span>
            <span>
              <span className={c.ok ? "" : "text-white/60"}>{c.label}</span>
              {!c.ok && <span className="block text-[11px] text-white/40">{c.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
