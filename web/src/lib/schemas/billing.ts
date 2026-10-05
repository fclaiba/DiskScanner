import { z } from "zod";

export const checkoutSchema = z.object({
  interval: z.enum(["month", "year"]),
});
