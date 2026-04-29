// ── Object Storage — multipart helpers ────────────────────────────────
// Re-exports of the multipart-related types from the driver layer plus
// a tiny Zod schema for parsing the `complete-multipart` request body.
//
// The driver itself owns the actual part bookkeeping; this module is
// purely a contract surface for the HTTP layer.

import { z } from "zod";

export const completeMultipartBodySchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        etag: z.string().min(1),
      }),
    )
    .min(1),
});

export type CompleteMultipartBody = z.infer<typeof completeMultipartBodySchema>;
