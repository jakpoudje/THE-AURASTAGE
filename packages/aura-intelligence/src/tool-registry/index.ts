// Tool definitions (directive §4). A tool is the ONLY way the assistant can change production data. The definition
// is pure data; the implementation (in apps/api/src/modules/assistant/tools) calls the owning domain's service, so the
// permission gate, versioning, audit and downstream review flags all apply exactly as for a manual edit.
import type { z } from "zod";
import type { AssistantModule } from "../contracts";

export interface ToolDefinition<I = unknown> {
  name: string;
  /** Workspace + action checked by the permission gate (migration 0019). */
  module: AssistantModule;
  action: "edit" | "create" | "generate" | "approve" | "lock";
  description: string;
  /** Typed input; the planner's JSON is validated against it before the user sees the proposal. */
  input: z.ZodType<I>;
  /** Which object the tool changes (for context and the before/after view). */
  target: "project" | "character" | "wardrobe_look" | "dialogue_line" | "scene" | "shot" | "location" | "prop" | "settings" | "audio_track";
  /** Downstream systems this change can flag for review (rule 11) — shown before the user applies it. */
  impact: string[];
  /** How the change is undone: the domain keeps a version to restore, or the tool can apply the inverse edit. */
  undo: "version" | "inverse";
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  register<I>(def: ToolDefinition<I>) {
    if (this.tools.has(def.name)) throw new Error(`tool ${def.name} registered twice`);
    this.tools.set(def.name, def as ToolDefinition);
    return this;
  }
  get(name: string) {
    return this.tools.get(name);
  }
  list(modules?: AssistantModule[]) {
    return [...this.tools.values()].filter((t) => !modules || modules.includes(t.module));
  }
}
