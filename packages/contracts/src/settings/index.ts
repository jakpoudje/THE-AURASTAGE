import { z } from "zod";
import { AspectRatioSchema } from "../generation";
import { DeliveryProfileIdSchema } from "../rendering";

// Canonical owner: Project Settings (SRS §13.1). Production-wide technical, provider and delivery
// policy. Every setting here changes real behaviour somewhere (listed per field); fixed facts of the
// pipeline (24 fps timebase, Rec.709, 48 kHz) are shown by the UI as facts, not as editable settings.

export const LOUDNESS_STANDARDS = {
  ebu_r128: { label: "EBU R128 (broadcast, Europe)", integrated_lufs: -23, tolerance_lu: 1, max_true_peak_dbtp: -1 },
  atsc_a85: { label: "ATSC A/85 (broadcast, US)", integrated_lufs: -24, tolerance_lu: 2, max_true_peak_dbtp: -2 },
  streaming: { label: "Streaming / online (-14 LUFS)", integrated_lufs: -14, tolerance_lu: 1, max_true_peak_dbtp: -1 },
} as const;
export const LoudnessStandardSchema = z.enum(["ebu_r128", "atsc_a85", "streaming"]);
export type LoudnessStandard = z.infer<typeof LoudnessStandardSchema>;
export type LoudnessTarget = { integrated_lufs: number; tolerance_lu: number; max_true_peak_dbtp: number };
export const loudnessTarget = (s: LoudnessStandard | undefined | null): LoudnessTarget => {
  const t = LOUDNESS_STANDARDS[s ?? "ebu_r128"];
  return { integrated_lufs: t.integrated_lufs, tolerance_lu: t.tolerance_lu, max_true_peak_dbtp: t.max_true_peak_dbtp };
};

const text = (max: number) => z.string().trim().max(max).nullable().default(null);

export const ProjectSettingsSchema = z
  .object({
    technical: z
      .object({
        /** Default frame shape for compiling shot prompts in Visual Generation. */
        aspect_ratio: AspectRatioSchema.default("16:9"),
        /** Audio Studio loudness check and deliverable loudness QC. */
        loudness_standard: LoudnessStandardSchema.default("ebu_r128"),
      })
      .strict()
      .default({}),
    style: z
      .object({
        /** Added to every compiled shot prompt ("Style matched"); changing it flags compiled prompts for review. */
        look: text(500),
        palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).default([]),
      })
      .strict()
      .default({}),
    generation: z
      .object({
        default_image_provider: z.string().max(40).nullable().default(null),
        default_video_provider: z.string().max(40).nullable().default(null),
        /** Paid (non-Sketch) takes allowed per calendar month; null = no cap. Enforced by the database. */
        monthly_paid_take_limit: z.number().int().min(0).max(100000).nullable().default(null),
      })
      .strict()
      .default({}),
    delivery: z
      .object({
        /** Deliverables this production must hand over; Export & Deliver tracks them. */
        required_profiles: z.array(DeliveryProfileIdSchema).max(10).default([]),
      })
      .strict()
      .default({}),
    production: z
      .object({
        /** Written into rendered files' metadata. */
        director: text(120),
        producer: text(120),
        company: text(120),
        country: text(80),
        year: z.number().int().min(1888).max(2200).nullable().default(null),
        copyright: text(200),
      })
      .strict()
      .default({}),
  })
  .strict();
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = ProjectSettingsSchema.parse({});

export const SaveProjectSettingsInputSchema = z
  .object({ base_revision: z.string().uuid().nullable(), settings: ProjectSettingsSchema })
  .strict();
export type SaveProjectSettingsInput = z.input<typeof SaveProjectSettingsInputSchema>;
