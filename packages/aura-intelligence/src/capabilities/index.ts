// Capability vocabulary (directive §22). Every Model Gateway backend declares which of these it supports, and the
// gateway never routes an operation to a backend that doesn't declare the capability.
export const CAPABILITIES = [
  "TEXT_REASONING", "SCRIPT_GENERATION", "IMAGE_GENERATION", "IMAGE_EDIT", "INPAINT", "STORYBOARD",
  "VOICE_GENERATION", "SPEECH_TO_SPEECH", "SPEECH_RECOGNITION", "MUSIC_GENERATION", "SFX_GENERATION",
  "VIDEO_GENERATION", "IMAGE_TO_VIDEO", "VIDEO_EXTENSION", "LIP_SYNC", "UPSCALE", "DENOISE", "OBJECT_REPAIR",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Execution classes the user can choose between (directive §6). */
export const EXECUTION_CLASSES = ["native", "local", "external", "test"] as const;
export type ExecutionClass = (typeof EXECUTION_CLASSES)[number];

export interface BackendDescriptor {
  id: string;
  name: string;
  execution: ExecutionClass;
  capabilities: Capability[];
  configured: boolean;
}

/** Routing preference: AuraStage native first, then local, then external; test only when asked or nothing else. */
export type RoutingMode = "aurastage" | "auto" | "external" | "test";

export function routeCapability(backends: BackendDescriptor[], capability: Capability, mode: RoutingMode = "auto", preferred?: string): BackendDescriptor | null {
  const able = backends.filter((b) => b.configured && b.capabilities.includes(capability));
  if (preferred) return able.find((b) => b.id === preferred) ?? null;
  const order: ExecutionClass[] =
    mode === "aurastage" ? ["native"] : mode === "external" ? ["external"] : mode === "test" ? ["test"] : ["native", "local", "external", "test"];
  for (const cls of order) {
    const b = able.find((x) => x.execution === cls);
    if (b) return b;
  }
  return null;
}
