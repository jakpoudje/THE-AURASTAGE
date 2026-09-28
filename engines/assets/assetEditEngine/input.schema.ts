import { z } from "zod";

/** Non-destructive audio edit, applied to a decoded file and saved as a new asset version. */
export const AudioEditSchema = z.object({
  trim_start: z.number().min(0).default(0),
  /** Seconds from the start of the original; null = to the end. */
  trim_end: z.number().positive().nullable().default(null),
  gain_db: z.number().min(-24).max(24).default(0),
  fade_in: z.number().min(0).max(30).default(0),
  fade_out: z.number().min(0).max(30).default(0),
  /** Scale so the loudest sample peaks here (dBFS), after gain; null = off. */
  normalize_peak_db: z.number().min(-24).max(0).nullable().default(null),
}).strict();
export type AudioEdit = z.infer<typeof AudioEditSchema>;

const Fraction = z.number().min(0).max(1);
/** Non-destructive image edit. Crop is in fractions of the original (before rotation). */
export const ImageEditSchema = z.object({
  crop: z.object({ x: Fraction, y: Fraction, w: Fraction.refine((v) => v > 0, "Crop width must be above 0"), h: Fraction.refine((v) => v > 0, "Crop height must be above 0") })
    .refine((c) => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, "Crop must stay inside the picture").default({ x: 0, y: 0, w: 1, h: 1 }),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flip_h: z.boolean().default(false),
  flip_v: z.boolean().default(false),
  /** Percent, 100 = unchanged. */
  brightness: z.number().min(0).max(200).default(100),
  contrast: z.number().min(0).max(200).default(100),
  saturation: z.number().min(0).max(200).default(100),
  /** Longest side after editing, in pixels; null = keep. */
  max_size: z.number().int().min(16).max(8192).nullable().default(null),
}).strict();
export type ImageEdit = z.infer<typeof ImageEditSchema>;
