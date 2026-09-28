import type { Guide, Trouble } from "../knowledge";
export type KnowledgeResult = { guides: (Guide & { score: number })[]; troubles: Trouble[]; engine_version: string };
