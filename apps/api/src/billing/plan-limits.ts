import { eq, and, sql, gte } from "drizzle-orm";
import {
  db as defaultDb,
  plans,
  subscriptions,
  sites,
  deployments,
} from "@back-to-the-future/db";

/** Database instance type — matches the tRPC context `db` field. */
type Db = typeof defaultDb;

// ── Free plan defaults (no subscription) ──────────────────────────

const FREE_PLAN_DEFAULTS = {
  id: "free",
  name: "Free",
  slug: "free",
  stripePriceId: null,
  stripeProductId: null,
  price: 0,
  interval: "month" as const,
  features: null,
  sitesLimit: 1,
  deploymentsPerMonth: 5,
  customDomains: false,
  aiRequestsPerMonth: 50,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
} as const;

// ── Limit check result shape ──────────────────────────────────────

interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
}

// ── getUserPlan ───────────────────────────────────────────────────

/**
 * Returns the user's current plan by joining subscriptions + plans.
 * If no active subscription exists, returns free plan defaults.
 */
export async function getUserPlan(db: Db, userId: string) {
  const result = await db
    .select({
      id: plans.id,
      name: plans.name,
      slug: plans.slug,
      stripePriceId: plans.stripePriceId,
      stripeProductId: plans.stripeProductId,
      price: plans.price,
      interval: plans.interval,
      features: plans.features,
      sitesLimit: plans.sitesLimit,
      deploymentsPerMonth: plans.deploymentsPerMonth,
      customDomains: plans.customDomains,
      aiRequestsPerMonth: plans.aiRequestsPerMonth,
      isActive: plans.isActive,
      sortOrder: plans.sortOrder,
      createdAt: plans.createdAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
      ),
    )
    .limit(1);

  return result[0] ?? FREE_PLAN_DEFAULTS;
}

// ── checkSiteLimit ────────────────────────────────────────────────

/**
 * Checks whether the user can create another site under their plan.
 */
export async function checkSiteLimit(
  db: Db,
  userId: string,
): Promise<LimitCheck> {
  const plan = await getUserPlan(db, userId);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(sites)
    .where(eq(sites.userId, userId));

  const current = countResult[0]?.count ?? 0;
  const limit = plan.sitesLimit;

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

// ── checkDeploymentLimit ──────────────────────────────────────────

/**
 * Checks whether the user can deploy again this calendar month.
 */
export async function checkDeploymentLimit(
  db: Db,
  userId: string,
): Promise<LimitCheck> {
  const plan = await getUserPlan(db, userId);

  // Start of current calendar month (UTC)
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(deployments)
    .where(
      and(
        eq(deployments.userId, userId),
        gte(deployments.createdAt, monthStart),
      ),
    );

  const current = countResult[0]?.count ?? 0;
  const limit = plan.deploymentsPerMonth;

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

// ── checkAiRequestLimit ───────────────────────────────────────────

/**
 * Checks whether the user can make another AI request this month.
 * Currently always returns allowed:true since AI request tracking
 * is not yet implemented.
 */
export async function checkAiRequestLimit(
  db: Db,
  userId: string,
): Promise<LimitCheck> {
  const plan = await getUserPlan(db, userId);

  // AI request tracking not yet implemented — allow all requests
  return {
    allowed: true,
    current: 0,
    limit: plan.aiRequestsPerMonth,
  };
}

// ── checkCustomDomainAllowed ──────────────────────────────────────

/**
 * Returns whether the user's plan allows custom domains.
 */
export async function checkCustomDomainAllowed(
  db: Db,
  userId: string,
): Promise<boolean> {
  const plan = await getUserPlan(db, userId);
  return plan.customDomains === true;
}
