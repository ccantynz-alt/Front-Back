// ── Products Router ─────────────────────────────────────────────────
// Stub: product registry CRUD. Will be expanded when the product
// management UI lands.

import { router, protectedProcedure } from "../init";

export const productsRouter = router({
  list: protectedProcedure.query(() => {
    return [];
  }),
});
