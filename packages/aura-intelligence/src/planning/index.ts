// Planner instructions. The reasoning backend (Claude, or the labelled TestProvider) returns a Plan; the plan is only
// a proposal until validated and approved by the user.
import { zodToJsonSchemaLite } from "./schema";
import type { AssistantRequest, ContextBundle, Intent } from "../contracts";
import type { ToolDefinition } from "../tool-registry";

export const PLANNER_VERSION = "1.0.0";

export const PLANNER_SYSTEM = `You are AuraStage, the production intelligence inside a professional film studio application.
A filmmaker asks for a change in plain language. Turn it into structured production operations using ONLY the tools
provided — never invent tools, never rewrite things that weren't asked for, and keep approved work unless the request
explicitly changes it.

Rules:
- Change only the fields the request is about. Leave every other field out of the tool input.
- Use the canonical ids given in the context. Never guess an id.
- If part of the request can't be done with the available tools, say so in "not_possible".
- If the request is ambiguous (which character? which scene?), ask in "questions" instead of guessing.
- Each call's "input_json" must be a JSON object matching that tool's input schema exactly.
- "summary" is one or two plain sentences a non-technical filmmaker understands.
- Asked to annotate or develop a whole scene in one pass: one modifyDialogue call per spoken line (intention, subtext,
  emotion, intensity — read from the scene's action, the line itself and the lines around it) and one updateSceneDNA call
  (purpose, stakes, mood, atmosphere, lighting_intent, sound_intent, camera_energy). Fill fields that are empty; change
  a field already filled only when the request asks for it. Up to 40 calls.
- The world is global: read names, places, languages, cultures and history as the script presents them, and never infer
  appearance, accent or culture from a name alone.`;

export function buildPlannerPrompt(req: AssistantRequest, intent: Intent, ctx: ContextBundle, tools: ToolDefinition[]) {
  const toolText = tools
    .map((t) => `- ${t.name} (${t.module}): ${t.description}\n  input schema: ${JSON.stringify(zodToJsonSchemaLite(t.input))}`)
    .join("\n");
  return [
    `Workspace: ${req.module}${req.object ? ` · focus: ${req.object.type} ${req.object.label || req.object.id}` : ""}`,
    `Detected: ${intent.operation}; mentions: ${intent.mentions.join(", ") || "none"}`,
    `Project: ${ctx.project.title}${ctx.project.genre ? ` (${ctx.project.genre})` : ""}`,
    "Context (canonical ids and versions):",
    JSON.stringify(ctx.items),
    "Tools:",
    toolText,
    `Request: ${req.text}`,
  ].join("\n");
}
