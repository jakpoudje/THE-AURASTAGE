// Minimal zod -> JSON-schema description for tool listings in the planner prompt, with the limits a tool enforces
// (lengths, ranges, allowed values, required and unknown keys) so the model can respect them. Validation always uses
// the real zod schema; `checkLite` is only the worker's early check, so a plan that breaks a limit is sent back to the
// model once to be fixed instead of reaching the person as an error.
import { z } from "zod";

type Lite = Record<string, any>;

export function zodToJsonSchemaLite(s: z.ZodTypeAny): Lite {
  const def = s._def as { typeName?: string } & Record<string, any>;
  const checks = (def.checks ?? []) as { kind: string; value?: number; inclusive?: boolean }[];
  const bound = (kind: string) => checks.find((c) => c.kind === kind)?.value;
  switch (def.typeName) {
    case "ZodObject": {
      const shape = (s as z.ZodObject<z.ZodRawShape>).shape;
      const required = Object.entries(shape).filter(([, v]) => !(v as z.ZodTypeAny).isOptional()).map(([k]) => k);
      return {
        type: "object",
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, zodToJsonSchemaLite(v as z.ZodTypeAny)])),
        ...(required.length ? { required } : {}),
        ...(def.unknownKeys === "strict" ? { additionalProperties: false } : {}),
      };
    }
    case "ZodString": {
      const out: Lite = { type: "string" };
      if (bound("min") !== undefined) out.minLength = bound("min");
      if (bound("max") !== undefined) out.maxLength = bound("max");
      if (bound("length") !== undefined) out.minLength = out.maxLength = bound("length");
      if (checks.some((c) => c.kind === "uuid")) out.format = "uuid";
      return out;
    }
    case "ZodNumber": {
      const out: Lite = { type: checks.some((c) => c.kind === "int") ? "integer" : "number" };
      if (bound("min") !== undefined) out.minimum = bound("min");
      if (bound("max") !== undefined) out.maximum = bound("max");
      return out;
    }
    case "ZodBoolean": return { type: "boolean" };
    case "ZodEnum": return { enum: def.values };
    case "ZodLiteral": return { const: def.value };
    case "ZodArray": {
      const out: Lite = { type: "array", items: zodToJsonSchemaLite(def.type) };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      return out;
    }
    case "ZodRecord": return { type: "object", additionalProperties: zodToJsonSchemaLite(def.valueType) };
    case "ZodUnion": return { anyOf: (def.options as z.ZodTypeAny[]).map(zodToJsonSchemaLite) };
    case "ZodNullable": return { ...zodToJsonSchemaLite(def.innerType), nullable: true };
    case "ZodOptional": case "ZodDefault": return zodToJsonSchemaLite(def.innerType);
    case "ZodEffects": return zodToJsonSchemaLite(def.schema);
    default: return {};
  }
}

/** Problems with `value` against a lite schema, as "path: message" lines (empty = no problem found). */
export function checkLite(schema: Lite, value: unknown, path = "input"): string[] {
  if (!schema || typeof schema !== "object") return [];
  if (value === null) return schema.nullable || Object.keys(schema).length === 0 ? [] : [`${path}: may not be empty (null)`];
  if (schema.anyOf) return (schema.anyOf as Lite[]).some((o) => checkLite(o, value, path).length === 0) ? [] : [`${path}: doesn't match any allowed form`];
  if ("const" in schema) return value === schema.const ? [] : [`${path}: must be ${JSON.stringify(schema.const)}`];
  if (schema.enum) return (schema.enum as unknown[]).includes(value) ? [] : [`${path}: must be one of ${(schema.enum as unknown[]).join(", ")}`];
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return [`${path}: must be text`];
      const out: string[] = [];
      if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${path}: at most ${schema.maxLength} characters (this is ${value.length}) — shorten it`);
      if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${path}: at least ${schema.minLength} characters`);
      return out;
    }
    case "number": case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) return [`${path}: must be a number`];
      const out: string[] = [];
      if (schema.type === "integer" && !Number.isInteger(value)) out.push(`${path}: must be a whole number`);
      if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: at most ${schema.maximum}`);
      return out;
    }
    case "boolean": return typeof value === "boolean" ? [] : [`${path}: must be true or false`];
    case "array": {
      if (!Array.isArray(value)) return [`${path}: must be a list`];
      const out: string[] = [];
      if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: at most ${schema.maxItems} items`);
      if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: at least ${schema.minItems} items`);
      value.forEach((v, i) => out.push(...checkLite(schema.items, v, `${path}.${i}`)));
      return out;
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return [`${path}: must be an object`];
      const v = value as Record<string, unknown>;
      const props = (schema.properties ?? {}) as Record<string, Lite>;
      const out: string[] = [];
      for (const k of (schema.required ?? []) as string[]) if (!(k in v)) out.push(`${path}.${k}: is required`);
      for (const [k, x] of Object.entries(v)) {
        if (props[k]) out.push(...checkLite(props[k], x, `${path}.${k}`));
        else if (schema.additionalProperties === false) out.push(`${path}.${k}: isn't a field of this tool — leave it out`);
        else if (schema.additionalProperties && typeof schema.additionalProperties === "object") out.push(...checkLite(schema.additionalProperties, x, `${path}.${k}`));
      }
      return out;
    }
    default: return [];
  }
}
