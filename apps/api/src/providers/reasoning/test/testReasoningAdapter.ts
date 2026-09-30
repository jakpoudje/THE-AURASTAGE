// apps/api/src/providers/reasoning/test/testReasoningAdapter.ts
// The labelled TestProvider for reasoning (directive §17). It does NOT understand language: it recognises a fixed set
// of production phrasings (time of day, weather, mood, age, wardrobe, subtle dialogue, annotating a whole scene, camera, story fields, describing a location or prop, titles & credits and credit names in Project Settings, quieter/louder/muted tracks in a scene's mix) and turns
// them into real tool calls against the canonical ids in the context, so the whole Ask AuraStage flow can be tested
// end to end without a paid model. Everything it returns is marked test_output and labelled in the UI.
import { ProviderError } from "../../types";
import type { ReasoningAdapter, ReasoningRequest, ReasoningResult } from "../types";
import * as writer from "./testWriter";
import { phrasePlan, type Snapshot } from "../../../modules/assistant/builtin/phrases";
export { readLine } from "../../../modules/assistant/builtin/phrases";

export const testReasoningAdapter: ReasoningAdapter = {
  id: "aurastage-test",
  name: "AuraStage test planner",
  execution: "test",
  note: "Deterministic development planner — no AI. Recognises common production requests so the flow can be tested without a paid API.",
  isConfigured: () => true,
  async complete<T>(req: ReasoningRequest<T>): Promise<ReasoningResult<T>> {
    // AuraScript tasks: the test writer arranges the structured task into the right shape (labelled TEST OUTPUT).
    if (req.task && req.task.kind !== "plan") {
      const snap = req.task.snapshot as Record<string, any>;
      const data = req.task.kind === "develop_story" ? writer.developStory(snap) : req.task.kind === "outline" ? writer.outline(snap)
        : req.task.kind === "write_scenes" ? writer.writeScenes(snap) : writer.rewrite(snap);
      const ok = req.schema.safeParse(data);
      if (!ok.success) throw new ProviderError(`The test writer produced an invalid ${req.task.kind}: ${ok.error.issues[0]?.message}`);
      return { data: ok.data, test_output: true, model: "aurastage-test-writer-1", provider_request_id: null, usage: { input_tokens: 0, output_tokens: 0 } };
    }
    if (req.task?.kind !== "plan") throw new ProviderError("The test planner only handles Ask AuraStage plans.");
    const out = req.schema.safeParse(phrasePlan(req.task.snapshot as Snapshot));
    if (!out.success) throw new ProviderError("The test planner produced an invalid plan (bug).");
    return { data: out.data, test_output: true, model: "aurastage-test-planner-1.0.0", provider_request_id: null, usage: { input_tokens: 0, output_tokens: 0 } };
  },
};
