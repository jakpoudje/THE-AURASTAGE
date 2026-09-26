import type { CharacterRole } from "@aurastage/contracts";

const LABEL: Record<CharacterRole, string> = { lead: "Lead", supporting: "Supporting", minor: "Minor", extra: "Extra" };
const TONE: Record<CharacterRole, string> = {
  lead: "border-aura-gold/60 text-aura-gold",
  supporting: "border-sky-400/50 text-sky-300",
  minor: "border-white/25 text-white/60",
  extra: "border-white/15 text-white/40",
};

export function RolePill({ role }: { role: CharacterRole }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${TONE[role]}`}>{LABEL[role]}</span>;
}
