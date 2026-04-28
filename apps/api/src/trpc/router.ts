import { z } from "zod";
import { publicProcedure, router } from "./init";
import { adminRouter } from "./procedures/admin";
import { aiRouter } from "./procedures/ai";
import { aiDeployRouter } from "./procedures/aiDeploy";
import { analyticsRouter } from "./procedures/analytics";
import { analyticsChartsRouter } from "./procedures/analytics-charts";
import { apiKeysRouter } from "./procedures/apiKeys";
import { auditRouter } from "./procedures/audit";
import { authRouter } from "./procedures/auth";
import { billingRouter } from "./procedures/billing";
import { chatRouter } from "./procedures/chat";
import { collabRouter } from "./procedures/collab";
import { commsRouter } from "./procedures/comms";
import { creditsRouter } from "./procedures/credits";
import { dbInspectorRouter } from "./procedures/db-inspector";
import { deploymentsRouter } from "./procedures/deployments";
import { dnsRouter } from "./procedures/dns";
import { dnsImportRouter } from "./procedures/dns-import";
import { domainSearchRouter } from "./procedures/domain-search";
import { domainsRouter } from "./procedures/domains";
import { emailRouter } from "./procedures/email";
import { esimRouter } from "./procedures/esim";
import { featureFlagsRouter } from "./procedures/featureFlags";
import { flywheelRouter } from "./procedures/flywheel";
import { gluecronRouter } from "./procedures/gluecron";
import { importRouter } from "./procedures/importProject";
import { launchRouter } from "./procedures/launch";
import { metricsRouter } from "./procedures/metrics";
import { notificationsRouter } from "./procedures/notifications";
import { productTenantsRouter } from "./procedures/productTenants";
import { productsRouter } from "./procedures/products";
import { projectsRouter } from "./procedures/projects";
import { reposRouter } from "./procedures/repos";
import { smsRouter } from "./procedures/sms";
import { storageRouter } from "./procedures/storage";
import { supportRouter } from "./procedures/support";
import { tenantRouter } from "./procedures/tenant";
import { theatreRouter } from "./procedures/theatre";
import { uiRouter } from "./procedures/ui";
import { usageRouter } from "./procedures/usage";
import { usersRouter } from "./procedures/users";
import { voiceRouter } from "./procedures/voice";
import { webhooksRouter } from "./procedures/webhooks";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  hello: publicProcedure.input(z.object({ name: z.string() })).query(({ input }) => {
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
  analyticsCharts: analyticsChartsRouter,
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
  projects: projectsRouter,
  deployments: deploymentsRouter,
  import: importRouter,
  aiDeploy: aiDeployRouter,
  theatre: theatreRouter,
  flywheel: flywheelRouter,
  voice: voiceRouter,
  launch: launchRouter,
  usage: usageRouter,
  dnsImport: dnsImportRouter,
  dns: dnsRouter,
  domainSearch: domainSearchRouter,
  domains: domainsRouter,
  esim: esimRouter,
  sms: smsRouter,
  dbInspector: dbInspectorRouter,
  metrics: metricsRouter,
  gluecron: gluecronRouter,
  comms: commsRouter,
  credits: creditsRouter,
});

export type AppRouter = typeof appRouter;
