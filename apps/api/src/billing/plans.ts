import { z } from "zod";

// ---------------------------------------------------------------------------
// Plan tier enum
// ---------------------------------------------------------------------------

export const PlanId = z.enum(["free", "pro", "team", "enterprise"]);
export type PlanId = z.infer<typeof PlanId>;

// ---------------------------------------------------------------------------
// Billing interval
// ---------------------------------------------------------------------------

export const BillingInterval = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof BillingInterval>;

// ---------------------------------------------------------------------------
// Plan definition schema
// ---------------------------------------------------------------------------

export const PlanDefinitionSchema = z.object({
  id: PlanId,
  name: z.string(),
  description: z.string(),
  priceMonthly: z.number().nonnegative(),
  priceYearly: z.number().nonnegative(),
  stripePriceIdMonthly: z.string().nullable(),
  stripePriceIdYearly: z.string().nullable(),
  perSeat: z.boolean(),
  limits: z.object({
    sites: z.number().nonnegative().or(z.literal(-1)), // -1 = unlimited
    aiCredits: z.number().nonnegative().or(z.literal(-1)),
    storageBytes: z.number().nonnegative().or(z.literal(-1)),
    videoMinutes: z.number().nonnegative().or(z.literal(-1)),
    collaborators: z.number().nonnegative().or(z.literal(-1)),
  }),
  features: z.array(z.string()),
});

export type PlanDefinition = z.infer<typeof PlanDefinitionSchema>;

// ---------------------------------------------------------------------------
// Concrete plan catalog
// ---------------------------------------------------------------------------

const GB = 1_073_741_824; // bytes

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "Get started with Cronix — client-side AI, one site, zero cost.",
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    perSeat: false,
    limits: {
      sites: 1,
      aiCredits: 0, // client-side only
      storageBytes: 1 * GB,
      videoMinutes: 0,
      collaborators: 0,
    },
    features: [
      "1 published site",
      "Client-side AI (WebGPU)",
      "1 GB storage",
      "Community support",
    ],
  },

  pro: {
    id: "pro",
    name: "Pro",
    description: "For creators who need full AI power and unlimited sites.",
    priceMonthly: 2900, // cents
    priceYearly: 27900, // cents ($279/yr — 2 months free)
    stripePriceIdMonthly: process.env["STRIPE_PRO_MONTHLY_PRICE_ID"] ?? "",
    stripePriceIdYearly: process.env["STRIPE_PRO_YEARLY_PRICE_ID"] ?? "",
    perSeat: false,
    limits: {
      sites: -1,
      aiCredits: 10_000,
      storageBytes: 50 * GB,
      videoMinutes: 60,
      collaborators: 0,
    },
    features: [
      "Unlimited sites",
      "10,000 AI credits / month",
      "50 GB storage",
      "60 min video processing",
      "Priority support",
      "Custom domains",
    ],
  },

  team: {
    id: "team",
    name: "Team",
    description: "Real-time collaboration for teams building together.",
    priceMonthly: 7900, // cents per seat
    priceYearly: 75900, // cents per seat/yr
    stripePriceIdMonthly: process.env["STRIPE_TEAM_MONTHLY_PRICE_ID"] ?? "",
    stripePriceIdYearly: process.env["STRIPE_TEAM_YEARLY_PRICE_ID"] ?? "",
    perSeat: true,
    limits: {
      sites: -1,
      aiCredits: 50_000,
      storageBytes: 200 * GB,
      videoMinutes: 300,
      collaborators: -1,
    },
    features: [
      "Everything in Pro",
      "50,000 AI credits / month",
      "200 GB storage",
      "300 min video processing",
      "Real-time collaboration (CRDTs)",
      "Shared workspaces",
      "Team roles & permissions",
      "Priority support",
    ],
  },

  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom pricing, dedicated infrastructure, SLA guarantees.",
    priceMonthly: 0, // custom
    priceYearly: 0,
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    perSeat: true,
    limits: {
      sites: -1,
      aiCredits: -1,
      storageBytes: -1,
      videoMinutes: -1,
      collaborators: -1,
    },
    features: [
      "Everything in Team",
      "Unlimited AI credits",
      "Unlimited storage",
      "Unlimited video processing",
      "Dedicated infrastructure",
      "99.99% SLA",
      "SOC 2 & HIPAA compliance",
      "SSO (SAML / OIDC)",
      "SCIM provisioning",
      "Dedicated account manager",
    ],
  },
} as const;

/**
 * Look up the Stripe Price ID for a given plan + interval.
 * Returns null for free / enterprise (custom).
 */
export function getStripePriceId(
  planId: PlanId,
  interval: BillingInterval,
): string | null {
  const plan = PLANS[planId];
  return interval === "month"
    ? plan.stripePriceIdMonthly
    : plan.stripePriceIdYearly;
}

/**
 * Resolve a Stripe Price ID back to a plan.
 */
export function planFromStripePriceId(priceId: string): PlanDefinition | undefined {
  return Object.values(PLANS).find(
    (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId,
  );
}
