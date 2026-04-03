// ── Billing State Store ──────────────────────────────────────────────
// Reactive billing state: plan, usage stats, subscription status,
// and derived feature limits.
// Uses module-level signals for global reactive state.

import { type Accessor, createResource, createSignal } from "solid-js";
import { isServer } from "solid-js/web";

// ── Types ────────────────────────────────────────────────────────────

export type PlanTier = "free" | "starter" | "pro" | "enterprise";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "unpaid" | "none";

export interface Plan {
  tier: PlanTier;
  name: string;
  priceMonthly: number;
  priceYearly: number;
}

export interface UsageStats {
  aiTokensUsed: number;
  aiTokensLimit: number;
  videoMinutesUsed: number;
  videoMinutesLimit: number;
  storageBytesUsed: number;
  storageBytesLimit: number;
  projectsUsed: number;
  projectsLimit: number;
  collaboratorsUsed: number;
  collaboratorsLimit: number;
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  trialEnd?: number;
}

export interface FeatureLimits {
  maxProjects: number;
  maxCollaborators: number;
  maxAITokensPerMonth: number;
  maxVideoMinutesPerMonth: number;
  maxStorageBytes: number;
  customDomain: boolean;
  prioritySupport: boolean;
  advancedAnalytics: boolean;
  whiteLabeling: boolean;
  apiAccess: boolean;
  ssoEnabled: boolean;
}

export interface BillingStore {
  /** Current plan */
  plan: Accessor<Plan>;
  /** Usage statistics */
  usage: Accessor<UsageStats>;
  /** Subscription information */
  subscription: Accessor<SubscriptionInfo>;
  /** Feature limits derived from plan */
  featureLimits: Accessor<FeatureLimits>;
  /** Whether billing data is loading */
  isLoading: Accessor<boolean>;
  /** Error from loading billing data */
  error: Accessor<string | null>;
  /** Whether a specific feature is available */
  hasFeature: (feature: keyof FeatureLimits) => boolean;
  /** Whether a usage limit has been reached */
  isAtLimit: (resource: "aiTokens" | "videoMinutes" | "storage" | "projects" | "collaborators") => boolean;
  /** Usage percentage for a resource (0-100) */
  usagePercent: (resource: "aiTokens" | "videoMinutes" | "storage" | "projects" | "collaborators") => number;
  /** Refresh billing data from server */
  refresh: () => void;
  /** Update usage locally (optimistic) */
  addUsage: (resource: "aiTokens" | "videoMinutes" | "storage", amount: number) => void;
}

// ── Plan Limits Configuration ────────────────────────────────────────

const PLAN_LIMITS: Record<PlanTier, FeatureLimits> = {
  free: {
    maxProjects: 3,
    maxCollaborators: 1,
    maxAITokensPerMonth: 50_000,
    maxVideoMinutesPerMonth: 5,
    maxStorageBytes: 500 * 1024 * 1024, // 500MB
    customDomain: false,
    prioritySupport: false,
    advancedAnalytics: false,
    whiteLabeling: false,
    apiAccess: false,
    ssoEnabled: false,
  },
  starter: {
    maxProjects: 10,
    maxCollaborators: 3,
    maxAITokensPerMonth: 500_000,
    maxVideoMinutesPerMonth: 30,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
    customDomain: true,
    prioritySupport: false,
    advancedAnalytics: false,
    whiteLabeling: false,
    apiAccess: true,
    ssoEnabled: false,
  },
  pro: {
    maxProjects: 50,
    maxCollaborators: 10,
    maxAITokensPerMonth: 5_000_000,
    maxVideoMinutesPerMonth: 300,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50GB
    customDomain: true,
    prioritySupport: true,
    advancedAnalytics: true,
    whiteLabeling: false,
    apiAccess: true,
    ssoEnabled: true,
  },
  enterprise: {
    maxProjects: Number.MAX_SAFE_INTEGER,
    maxCollaborators: Number.MAX_SAFE_INTEGER,
    maxAITokensPerMonth: Number.MAX_SAFE_INTEGER,
    maxVideoMinutesPerMonth: Number.MAX_SAFE_INTEGER,
    maxStorageBytes: Number.MAX_SAFE_INTEGER,
    customDomain: true,
    prioritySupport: true,
    advancedAnalytics: true,
    whiteLabeling: true,
    apiAccess: true,
    ssoEnabled: true,
  },
};

// ── Default Values ───────────────────────────────────────────────────

const DEFAULT_PLAN: Plan = {
  tier: "free",
  name: "Free",
  priceMonthly: 0,
  priceYearly: 0,
};

const DEFAULT_USAGE: UsageStats = {
  aiTokensUsed: 0,
  aiTokensLimit: PLAN_LIMITS.free.maxAITokensPerMonth,
  videoMinutesUsed: 0,
  videoMinutesLimit: PLAN_LIMITS.free.maxVideoMinutesPerMonth,
  storageBytesUsed: 0,
  storageBytesLimit: PLAN_LIMITS.free.maxStorageBytes,
  projectsUsed: 0,
  projectsLimit: PLAN_LIMITS.free.maxProjects,
  collaboratorsUsed: 0,
  collaboratorsLimit: PLAN_LIMITS.free.maxCollaborators,
};

const DEFAULT_SUBSCRIPTION: SubscriptionInfo = {
  status: "none",
  currentPeriodStart: Date.now(),
  currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
  cancelAtPeriodEnd: false,
};

// ── API Fetcher ──────────────────────────────────────────────────────

interface BillingData {
  plan: Plan;
  usage: UsageStats;
  subscription: SubscriptionInfo;
}

async function fetchBillingData(): Promise<BillingData> {
  const response = await fetch("/api/trpc/billing.current");
  if (!response.ok) {
    throw new Error(`Failed to fetch billing data: ${response.statusText}`);
  }
  const data = (await response.json()) as { result: { data: BillingData } };
  return data.result.data;
}

// ── Signals ──────────────────────────────────────────────────────────

const [plan, setPlan] = createSignal<Plan>(DEFAULT_PLAN);
const [usage, setUsage] = createSignal<UsageStats>(DEFAULT_USAGE);
const [subscription, setSubscription] = createSignal<SubscriptionInfo>(DEFAULT_SUBSCRIPTION);
const [error, setError] = createSignal<string | null>(null);

// Async billing data loading
const [billingResource, { refetch: refetchBilling }] = createResource<BillingData>(
  () => !isServer,
  async (): Promise<BillingData> => {
    try {
      setError(null);
      const data = await fetchBillingData();
      setPlan(data.plan);
      setUsage(data.usage);
      setSubscription(data.subscription);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load billing data";
      setError(message);
      throw err;
    }
  },
);

// ── Derived Signals ──────────────────────────────────────────────────

const featureLimits: Accessor<FeatureLimits> = (): FeatureLimits => {
  return PLAN_LIMITS[plan().tier];
};

const isLoading: Accessor<boolean> = (): boolean => billingResource.loading;

// ── Actions ──────────────────────────────────────────────────────────

function hasFeature(feature: keyof FeatureLimits): boolean {
  const limits = featureLimits();
  const value = limits[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return false;
}

function isAtLimit(
  resource: "aiTokens" | "videoMinutes" | "storage" | "projects" | "collaborators",
): boolean {
  const u = usage();
  switch (resource) {
    case "aiTokens":
      return u.aiTokensUsed >= u.aiTokensLimit;
    case "videoMinutes":
      return u.videoMinutesUsed >= u.videoMinutesLimit;
    case "storage":
      return u.storageBytesUsed >= u.storageBytesLimit;
    case "projects":
      return u.projectsUsed >= u.projectsLimit;
    case "collaborators":
      return u.collaboratorsUsed >= u.collaboratorsLimit;
  }
}

function usagePercent(
  resource: "aiTokens" | "videoMinutes" | "storage" | "projects" | "collaborators",
): number {
  const u = usage();
  let used: number;
  let limit: number;
  switch (resource) {
    case "aiTokens":
      used = u.aiTokensUsed;
      limit = u.aiTokensLimit;
      break;
    case "videoMinutes":
      used = u.videoMinutesUsed;
      limit = u.videoMinutesLimit;
      break;
    case "storage":
      used = u.storageBytesUsed;
      limit = u.storageBytesLimit;
      break;
    case "projects":
      used = u.projectsUsed;
      limit = u.projectsLimit;
      break;
    case "collaborators":
      used = u.collaboratorsUsed;
      limit = u.collaboratorsLimit;
      break;
  }
  if (limit === 0 || limit === Number.MAX_SAFE_INTEGER) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function addUsage(resource: "aiTokens" | "videoMinutes" | "storage", amount: number): void {
  setUsage((prev) => {
    switch (resource) {
      case "aiTokens":
        return { ...prev, aiTokensUsed: prev.aiTokensUsed + amount };
      case "videoMinutes":
        return { ...prev, videoMinutesUsed: prev.videoMinutesUsed + amount };
      case "storage":
        return { ...prev, storageBytesUsed: prev.storageBytesUsed + amount };
      default:
        return prev;
    }
  });
}

function refresh(): void {
  refetchBilling();
}

// ── Exported Store ───────────────────────────────────────────────────

export const billingStore: BillingStore = {
  plan,
  usage,
  subscription,
  featureLimits,
  isLoading,
  error,
  hasFeature,
  isAtLimit,
  usagePercent,
  refresh,
  addUsage,
};

export function useBilling(): BillingStore {
  return billingStore;
}
