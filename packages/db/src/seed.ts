import { createClient } from "./client";
import { users, sites, plans } from "./schema";

/**
 * Seeds the development database with a test user and a sample site.
 *
 * Uses the Turso/libSQL client (the primary edge database).
 * Set DATABASE_URL and optionally DATABASE_AUTH_TOKEN in your environment.
 */
export async function seed(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env["DATABASE_URL"] ?? "file:local.db";
  const authToken = process.env["DATABASE_AUTH_TOKEN"];
  const db = createClient(url, authToken);

  const testUserId = "00000000-0000-0000-0000-000000000001";
  const testSiteId = "00000000-0000-0000-0000-000000000010";

  console.log("Seeding test user...");

  await db
    .insert(users)
    .values({
      id: testUserId,
      email: "dev@backtothe.future",
      displayName: "Dev User",
      role: "admin",
    })
    .onConflictDoNothing();

  console.log("Seeding sample site...");

  await db
    .insert(sites)
    .values({
      id: testSiteId,
      userId: testUserId,
      name: "My First Site",
      slug: "my-first-site",
      description: "A sample site created by the seed script.",
      pageLayout: JSON.stringify({
        sections: [
          { type: "hero", title: "Welcome", subtitle: "Built with Back to the Future" },
          { type: "content", body: "This is a sample page layout." },
        ],
      }),
      status: "draft",
    })
    .onConflictDoNothing();

  console.log("Seeding pricing plans...");

  const planData = [
    {
      id: "plan-free",
      name: "Free",
      slug: "free",
      stripePriceId: null,
      stripeProductId: null,
      price: 0,
      interval: "month" as const,
      features: JSON.stringify(["1 site", "10 deploys/month", "100 AI requests/month", "Community support"]),
      sitesLimit: 1,
      deploymentsPerMonth: 10,
      customDomains: false,
      aiRequestsPerMonth: 100,
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "plan-pro-monthly",
      name: "Pro",
      slug: "pro",
      stripePriceId: null, // Set via STRIPE_PRO_MONTHLY_PRICE_ID env or Stripe dashboard
      stripeProductId: null,
      price: 2900, // $29.00
      interval: "month" as const,
      features: JSON.stringify(["10 sites", "100 deploys/month", "1,000 AI requests/month", "Custom domains", "Priority email support", "Advanced analytics"]),
      sitesLimit: 10,
      deploymentsPerMonth: 100,
      customDomains: true,
      aiRequestsPerMonth: 1000,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "plan-enterprise-monthly",
      name: "Enterprise",
      slug: "enterprise",
      stripePriceId: null, // Set via Stripe dashboard
      stripeProductId: null,
      price: 9900, // $99.00
      interval: "month" as const,
      features: JSON.stringify(["Unlimited sites", "Unlimited deploys", "Unlimited AI requests", "Custom domains", "Priority support with SLA", "Advanced analytics"]),
      sitesLimit: 999999,
      deploymentsPerMonth: 999999,
      customDomains: true,
      aiRequestsPerMonth: 999999,
      isActive: true,
      sortOrder: 2,
    },
  ];

  for (const plan of planData) {
    await db.insert(plans).values(plan).onConflictDoNothing();
  }

  console.log("Seed complete.");
}

// Allow running directly via `bun run packages/db/src/seed.ts`
if (import.meta.main) {
  seed()
    .then(() => {
      console.log("Seed finished successfully.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}
