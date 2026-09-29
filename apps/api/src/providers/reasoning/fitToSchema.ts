// apps/api/src/providers/reasoning/fitToSchema.ts
// Structured outputs can't enforce length, count or range limits (they are only described to the model — see
// anthropicReasoningAdapter.toStructuredOutputSchema), so a good answer can miss a limit by a little: a name reason of
// 430 characters where 400 are allowed, six themes where five are, "Protagonist" for "protagonist". Rejecting the whole
// answer for that failed real story development live (2026-09-29). Before validation, the answer is fitted to the
// schema: short text over its limit is cut at the last sentence (or word) that fits, lists over their limit keep their first
// items, numbers are clamped (and rounded where an integer is required), enum values match case-insensitively, and
// unknown keys on strict objects are dropped. Every change is reported as a path, so nothing is adjusted silently.
// Anything that still doesn't validate (missing fields, wrong types, too few items) is still refused.
import type { ZodTypeAny } from "zod";

type Def = { typeName?: string; [k: string]: any };
const defOf = (s: ZodTypeAny): Def => (s as unknown as { _def: Def })._def;

function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf(".\n"));
  if (sentence >= max * 0.5) return head.slice(0, sentence + 1);
  // Otherwise the last whole word, marked with an ellipsis (still within the limit).
  const word = head.lastIndexOf(" ");
  return (word >= max * 0.5 ? head.slice(0, word).replace(/[\s,;:–—-]+$/, "") : head.slice(0, max - 1)) + "…";
}

export function fitToSchema(schema: ZodTypeAny, value: unknown, path = "", changes: string[] = []): unknown {
  const d = defOf(schema);
  const at = path || "(answer)";
  switch (d.typeName) {
    case "ZodOptional":
    case "ZodNullable":
      return value === undefined || value === null ? value : fitToSchema(d.innerType, value, path, changes);
    case "ZodDefault":
      return value === undefined ? value : fitToSchema(d.innerType, value, path, changes);
    case "ZodEffects":
      return fitToSchema(d.schema, value, path, changes);
    case "ZodString": {
      if (typeof value !== "string") return value;
      const max = (d.checks as { kind: string; value: number }[]).find((c) => c.kind === "max")?.value;
      // Long-form text (a scene's Fountain, limits above 8,000 characters) is never cut: it is refused instead.
      if (max !== undefined && value.length > max && max <= 8000) {
        changes.push(`${at}: shortened from ${value.length} to ${max} characters`);
        return cutText(value, max);
      }
      return value;
    }
    case "ZodNumber": {
      if (typeof value !== "number" || !Number.isFinite(value)) return value;
      let v = value;
      for (const c of d.checks as { kind: string; value?: number }[]) {
        if (c.kind === "int" && !Number.isInteger(v)) v = Math.round(v);
        if (c.kind === "min" && c.value !== undefined && v < c.value) v = c.value;
        if (c.kind === "max" && c.value !== undefined && v > c.value) v = c.value;
      }
      if (v !== value) changes.push(`${at}: ${value} → ${v}`);
      return v;
    }
    case "ZodEnum": {
      if (typeof value !== "string" || (d.values as string[]).includes(value)) return value;
      const hit = (d.values as string[]).find((x) => x.toLowerCase() === value.trim().toLowerCase());
      if (hit) changes.push(`${at}: "${value}" → "${hit}"`);
      return hit ?? value;
    }
    case "ZodArray": {
      if (!Array.isArray(value)) return value;
      let items = value.map((x, i) => fitToSchema(d.type, x, `${path}[${i}]`, changes));
      const max = d.maxLength?.value as number | undefined;
      if (max !== undefined && items.length > max) {
        changes.push(`${at}: kept the first ${max} of ${items.length} items`);
        items = items.slice(0, max);
      }
      return items;
    }
    case "ZodObject": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const shape = (typeof d.shape === "function" ? d.shape() : d.shape) as Record<string, ZodTypeAny>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (shape[k]) out[k] = fitToSchema(shape[k], v, path ? `${path}.${k}` : k, changes);
        else if (d.unknownKeys === "strict") changes.push(`${path ? `${path}.${k}` : k}: unexpected field dropped`);
        else out[k] = v;
      }
      return out;
    }
    default:
      return value;
  }
}

/** Short, content-free description of what still doesn't validate (paths and messages only). */
export function describeIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues.slice(0, 4).map((i) => `${i.path.join(".") || "(answer)"}: ${i.message}`).join("; ");
}
