import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "@cronix/db";
import { subscriptions, usageRecords } from "@cronix/db";
import { reportUsage, getStripe } from "./stripe";
import { PLANS, type PlanId } from "./plans";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UsageType = "ai_tokens" | "video_minutes" | "storage_bytes";

interface UsageEntry {
  userId: string;
  type: UsageType;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Internal: persist a usage record locally
// ---------------------------------------------------------------------------

async function persistUsageRecord(entry: UsageEntry): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(usageRecords).values({
    id,
    userId: entry.userId,
    type: entry.type,
    quantity: entry.quantity,
    recordedAt: new Date(),
  });
  return id;
}

// ---------------------------------------------------------------------------
// Internal: resolve the Stripe subscription item for metered billing
// ---------------------------------------------------------------------------

async function getMeteredSubscriptionItemId(
  userId: string,
  _usageType: UsageType,
): Promise<string | null> {
  const subResult = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const sub = subResult[0];
  if (!sub?.stripeSubscriptionId) return null;

  // Retrieve the full subscription from Stripe to find the metered item
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(
    sub.stripeSubscriptionId,
    { expand: ["items.data"] },
  );

  // Find the metered price item (recurring.usage_type === "metered")
  const meteredItem = stripeSub.items.data.find(
    (item) => item.price.recurring?.usage_type === "metered",
  );

  return meteredItem?.id ?? null;
}

// ---------------------------------------------------------------------------
// Internal: check if usage exceeds plan limits
// ---------------------------------------------------------------------------

async function checkUsageLimits(
  userId: string,
  type: UsageType,
  additionalQuantity: number,
): Promise<{ withinLimits: boolean; currentUsage: number; limit: number }> {
  const subResult = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const sub = subResult[0];
  const planId = (sub?.plan ?? "free") as PlanId;
  const plan = PLANS[planId];
  const periodStart = sub?.currentPeriodStart ?? new Date(0);

  // Map usage type to plan limit key
  const limitKey: Record<UsageType, keyof typeof plan.limits> = {
    ai_tokens: "aiCredits",
    video_minutes: "videoMinutes",
    storage_bytes: "storageBytes",
  };

  const limit = plan.limits[limitKey[type]];

  // -1 means unlimited
  if (limit === -1) {
    return { withinLimits: true, currentUsage: 0, limit: -1 };
  }

  // Sum current period usage
  const usageResult = await db
    .select({
      total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.type, type),
        gte(usageRecords.recordedAt, periodStart),
      ),
    );

  const currentUsage = usageResult[0]?.total ?? 0;

  return {
    withinLimits: currentUsage + additionalQuantity <= limit,
    currentUsage,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Batch buffer for Stripe usage reporting
// ---------------------------------------------------------------------------

interface BufferEntry {
  userId: string;
  type: UsageType;
  quantity: number;
}

const usageBuffer: BufferEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const FLUSH_THRESHOLD = 50; // or 50 entries, whichever comes first

async function flushUsageBuffer(): Promise<void> {
  if (usageBuffer.length === 0) return;

  // Drain the buffer
  const batch = usageBuffer.splice(0, usageBuffer.length);

  // Aggregate by userId + type
  const aggregated = new Map<string, number>();
  for (const entry of batch) {
    const key = `${entry.userId}:${entry.type}`;
    aggregated.set(key, (aggregated.get(key) ?? 0) + entry.quantity);
  }

  // Report each aggregated entry to Stripe
  for (const [key, quantity] of aggregated) {
    const [userId, type] = key.split(":") as [string, UsageType];
    try {
      const subscriptionItemId = await getMeteredSubscriptionItemId(
        userId,
        type,
      );
      if (subscriptionItemId) {
        await reportUsage({
          subscriptionItemId,
          quantity,
        });
      }
    } catch (err: unknown) {
      // Log but do not throw — usage is already persisted locally
      console.error(
        `[usage-tracker] Failed to report usage to Stripe for ${key}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushUsageBuffer();
  }, FLUSH_INTERVAL_MS);
}

function bufferUsage(entry: BufferEntry): void {
  usageBuffer.push(entry);
  if (usageBuffer.length >= FLUSH_THRESHOLD) {
    // Flush immediately when threshold is reached
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushUsageBuffer();
  } else {
    scheduleFlush();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UsageResult {
  recorded: boolean;
  withinLimits: boolean;
  currentUsage: number;
  limit: number;
}

/**
 * Track AI token usage after an AI request completes.
 * Persists locally and batches Stripe metered billing reports.
 */
export async function trackAIUsage(
  userId: string,
  tokens: number,
): Promise<UsageResult> {
  const limits = await checkUsageLimits(userId, "ai_tokens", tokens);

  // Always record usage (even if over limit — billing needs accurate numbers)
  await persistUsageRecord({ userId, type: "ai_tokens", quantity: tokens });
  bufferUsage({ userId, type: "ai_tokens", quantity: tokens });

  return {
    recorded: true,
    withinLimits: limits.withinLimits,
    currentUsage: limits.currentUsage + tokens,
    limit: limits.limit,
  };
}

/**
 * Track video processing minutes after a video job completes.
 */
export async function trackVideoUsage(
  userId: string,
  minutes: number,
): Promise<UsageResult> {
  const limits = await checkUsageLimits(userId, "video_minutes", minutes);

  await persistUsageRecord({
    userId,
    type: "video_minutes",
    quantity: minutes,
  });
  bufferUsage({ userId, type: "video_minutes", quantity: minutes });

  return {
    recorded: true,
    withinLimits: limits.withinLimits,
    currentUsage: limits.currentUsage + minutes,
    limit: limits.limit,
  };
}

/**
 * Track storage usage after a file upload.
 * Note: storage is cumulative (not per-period), so limit checks use total rather
 * than period-scoped sums.
 */
export async function trackStorageUsage(
  userId: string,
  bytes: number,
): Promise<UsageResult> {
  const limits = await checkUsageLimits(userId, "storage_bytes", bytes);

  await persistUsageRecord({
    userId,
    type: "storage_bytes",
    quantity: bytes,
  });
  bufferUsage({ userId, type: "storage_bytes", quantity: bytes });

  return {
    recorded: true,
    withinLimits: limits.withinLimits,
    currentUsage: limits.currentUsage + bytes,
    limit: limits.limit,
  };
}

/**
 * Force-flush any buffered usage records to Stripe.
 * Call this during graceful shutdown.
 */
export async function flushPendingUsage(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushUsageBuffer();
}
