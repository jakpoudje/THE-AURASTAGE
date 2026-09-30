"use client";

// Which AI writes for this platform right now (the connected reasoning backend and its model), for cost estimates.
// The built-in test planner is free; "none" means no AI writer is connected.
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";

export type AiWriter = { provider: string; model: string | null } | null;
let cached: Promise<AiWriter> | null = null;

export function useAiWriter(): AiWriter {
  const [w, setW] = useState<AiWriter>(null);
  useEffect(() => {
    cached ??= apiGet<{ planner: { id: string; model?: string | null } | null }>("/api/assistant/capabilities")
      .then((c) => (c.planner ? { provider: c.planner.id, model: c.planner.model ?? null } : null))
      .catch(() => ((cached = null), null));
    cached.then(setW);
  }, []);
  return w;
}
