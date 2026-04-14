// ── Product Tenants Router ──────────────────────────────────────────
// Stub: product-scoped tenant management. Will be expanded when
// multi-tenant provisioning lands.

import { router, protectedProcedure } from "../init";

export const productTenantsRouter = router({
  list: protectedProcedure.query(() => {
    return [];
  }),
});
