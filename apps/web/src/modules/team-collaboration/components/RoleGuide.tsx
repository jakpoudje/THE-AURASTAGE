"use client";

import { PERMISSION_MODULES, type ProjectRole } from "@aurastage/contracts";
import { MODULE_LABELS } from "../types";

const SHORT: Record<string, string> = { create: "C", edit: "E", generate: "G", approve: "A", lock: "L", administer: "M" };

/** What each role can do, straight from the role definitions the database enforces. */
export function RoleGuide({ roles }: { roles: ProjectRole[] }) {
  return (
    <details className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <summary className="cursor-pointer font-display text-lg">What each role can do</summary>
      <p className="mt-2 text-xs text-white/50">
        Everyone can view and comment. C create · E edit · G generate · A approve · L lock · M manage the team.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px]" aria-label="Role permissions">
          <thead className="text-white/50">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Role</th>
              {PERMISSION_MODULES.map((m) => (
                <th key={m} className="px-1 py-1 font-normal">{MODULE_LABELS[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-t border-aura-border/60">
                <td className="px-2 py-1" title={r.description}>{r.label}</td>
                {PERMISSION_MODULES.map((m) => {
                  const acts = [...(r.permissions["*"] ?? []), ...(r.permissions[m] ?? [])].filter((a) => SHORT[a]);
                  return (
                    <td key={m} className="px-1 py-1 text-center text-aura-gold">
                      {[...new Set(acts)].map((a) => SHORT[a]).join("") || <span className="text-white/20">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
