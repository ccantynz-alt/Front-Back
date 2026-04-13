import { z } from "zod";
import { router, publicProcedure } from "./init";
import { usersRouter } from "./procedures/users";
import { auditRouter } from "./procedures/audit";
import { authRouter } from "./procedures/auth";
import { billingRouter } from "./procedures/billing";
import { featureFlagsRouter } from "./procedures/featureFlags";
import { collabRouter } from "./procedures/collab";
import { emailRouter } from "./procedures/email";
import { adminRouter } from "./procedures/admin";
import { analyticsRouter } from "./procedures/analytics";
import { notificationsRouter } from "./procedures/notifications";
import { tenantRouter } from "./procedures/tenant";
import { apiKeysRouter } from "./procedures/apiKeys";
import { webhooksRouter } from "./procedures/webhooks";
import { supportRouter } from "./procedures/support";
import { aiRouter } from "./procedures/ai";
import { chatRouter } from "./procedures/chat";
import { productsRouter } from "./procedures/products";
import { productTenantsRouter } from "./procedures/productTenants";
import { uiRouter } from "./procedures/ui";
import { storageRouter } from "./procedures/storage";
import { reposRouter } from "./procedures/repos";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello, ${input.name}!` };
    }),

  users: usersRouter,
  audit: auditRouter,
  auth: authRouter,
  billing: billingRouter,
  featureFlags: featureFlagsRouter,
  collab: collabRouter,
  email: emailRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  notifications: notificationsRouter,
  tenant: tenantRouter,
  apiKeys: apiKeysRouter,
  webhooks: webhooksRouter,
  support: supportRouter,
  ai: aiRouter,
  chat: chatRouter,
  products: productsRouter,
  productTenants: productTenantsRouter,
  ui: uiRouter,
  storage: storageRouter,
  repos: reposRouter,
});

export type AppRouter = typeof appRouter;
