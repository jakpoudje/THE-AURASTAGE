import { z } from "zod";
export const DeliveryProfileInputSchema = z.object({ id: z.string().optional() });
