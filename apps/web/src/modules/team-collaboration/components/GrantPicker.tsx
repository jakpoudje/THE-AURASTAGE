"use client";

// Extra permissions on top of a role: a module × action grid. Actions the role already
// gives are shown ticked and fixed, so it's clear what the extras add.

import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "@aurastage/contracts";
import { MODULE_LABELS } from "../types";

const EXTRA_ACTIONS = PERMISSION_ACTIONS.filter((a) => a !== "view" && a !== "comment");

export function GrantPicker({
  rolePermissions,
  value,
  onChange,
  disabled,
}: {
  rolePermissions: Record<string, string[]>;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const fromRole = (m: string, a: string) => (rolePermissions["*"] ?? []).includes(a) || (rolePermissions[m] ?? []).includes(a);
  return (
    <div className="overflow-x-auto rounded-md border border-aura-border">
      <table className="w-full text-[11px]" aria-label="Extra permissions">
        <thead>
          <tr className="text-white/50">
            <th className="px-2 py-1 text-left font-normal">Workspace</th>
            {EXTRA_ACTIONS.map((a) => (
              <th key={a} className="px-1 py-1 font-normal capitalize">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((m) => (
            <tr key={m} className="border-t border-aura-border/60">
              <td className="px-2 py-1 text-white/70">{MODULE_LABELS[m]}</td>
              {EXTRA_ACTIONS.map((a) => {
                const key = `${m}:${a}`;
                const inherited = fromRole(m, a);
                return (
                  <td key={a} className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${MODULE_LABELS[m]} ${a}`}
                      checked={inherited || value.includes(key)}
                      disabled={disabled || inherited}
                      title={inherited ? "Included in the role" : undefined}
                      onChange={(e) => onChange(e.target.checked ? [...value, key] : value.filter((g) => g !== key))}
                      className="accent-[#d4a64a]"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
