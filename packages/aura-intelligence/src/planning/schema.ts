// Minimal zod -> JSON-schema description for tool listings in the planner prompt (documentation for the model;
// validation always uses the real zod schema).
import { z } from "zod";

export function zodToJsonSchemaLite(s: z.ZodTypeAny): unknown {
  const def = s._def as { typeName?: string } & Record<string, any>;
  switch (def.typeName) {
    case "ZodObject": {
      const shape = (s as z.ZodObject<z.ZodRawShape>).shape;
      return { type: "object", properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, zodToJsonSchemaLite(v as z.ZodTypeAny)])) };
    }
    case "ZodString": return { type: "string" };
    case "ZodNumber": return { type: "number" };
    case "ZodBoolean": return { type: "boolean" };
    case "ZodEnum": return { enum: def.values };
    case "ZodArray": return { type: "array", items: zodToJsonSchemaLite(def.type) };
    case "ZodOptional": case "ZodNullable": case "ZodDefault": return zodToJsonSchemaLite(def.innerType);
    case "ZodEffects": return zodToJsonSchemaLite(def.schema);
    default: return {};
  }
}
