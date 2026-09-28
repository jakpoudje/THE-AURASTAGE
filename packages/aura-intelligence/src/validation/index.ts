// Plan validation: nothing reaches the user (let alone the database) unless every call names a registered tool, its
// input validates against that tool's schema, and the user's permissions allow it.
import type { Plan } from "../contracts";
import type { ToolDefinition, ToolRegistry } from "../tool-registry";

export interface ValidCall { tool: string; input: unknown; reason: string; def: ToolDefinition; allowed: boolean }
export interface PlanIssue { index: number; tool: string; problem: string }

export function validatePlan(plan: Plan, registry: ToolRegistry, can: (module: string, action: string) => boolean) {
  const calls: ValidCall[] = [];
  const issues: PlanIssue[] = [];
  plan.calls.forEach((c, index) => {
    const def = registry.get(c.tool);
    if (!def) return issues.push({ index, tool: c.tool, problem: "No such tool" });
    let raw: unknown;
    try {
      raw = JSON.parse(c.input_json);
    } catch {
      return issues.push({ index, tool: c.tool, problem: "Input isn't valid JSON" });
    }
    const parsed = def.input.safeParse(raw);
    if (!parsed.success) return issues.push({ index, tool: c.tool, problem: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") });
    calls.push({ tool: c.tool, input: parsed.data, reason: c.reason, def, allowed: can(def.module, def.action) });
  });
  return { calls, issues, impact: [...new Set(calls.flatMap((c) => c.def.impact))] };
}
