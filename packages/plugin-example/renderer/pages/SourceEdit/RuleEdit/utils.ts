import z from "zod";

export function extractorSchema() {
  return z.object({
    selector: z.string().optional(),
    from: z.string().optional(),
    processors: z.array(z.any()).optional(),
  })
}