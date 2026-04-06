import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import { userWebhooks } from "@back-to-the-future/db";

const WEBHOOK_EVENTS = [
  "project.created",
  "project.updated",
  "project.deleted",
  "build.started",
  "build.completed",
  "build.failed",
  "deployment.created",
  "deployment.ready",
  "collaboration.joined",
  "collaboration.left",
  "ai.job.completed",
  "video.render.completed",
] as const;

type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Generate a webhook signing secret.
 */
function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Sign a webhook payload using HMAC-SHA256.
 */
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const webhooksRouter = router({
  /**
   * Register a new webhook URL for specific events.
   */
  create: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const secret = generateWebhookSecret();

      await ctx.db.insert(userWebhooks).values({
        id,
        userId: ctx.userId,
        url: input.url,
        events: JSON.stringify(input.events),
        secret,
        isActive: true,
        createdAt: new Date(),
      });

      return {
        id,
        url: input.url,
        events: input.events,
        secret, // Only returned on creation
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    }),

  /**
   * List all webhooks for the authenticated user.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const hooks = await ctx.db
      .select()
      .from(userWebhooks)
      .where(eq(userWebhooks.userId, ctx.userId));

    return hooks.map((hook) => ({
      id: hook.id,
      url: hook.url,
      events: JSON.parse(hook.events) as WebhookEvent[],
      isActive: hook.isActive,
      createdAt: hook.createdAt,
    }));
  }),

  /**
   * Delete a webhook.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(userWebhooks)
        .where(
          and(
            eq(userWebhooks.id, input.id),
            eq(userWebhooks.userId, ctx.userId),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found or does not belong to you.",
        });
      }

      return { success: true as const, id: input.id };
    }),

  /**
   * Send a test event to a webhook URL.
   */
  test: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(userWebhooks)
        .where(
          and(
            eq(userWebhooks.id, input.id),
            eq(userWebhooks.userId, ctx.userId),
          ),
        )
        .limit(1);

      const webhook = results[0];
      if (!webhook) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found.",
        });
      }

      const testPayload = JSON.stringify({
        event: "test",
        timestamp: new Date().toISOString(),
        data: {
          message: "This is a test webhook event from Marco Reid.",
        },
      });

      const signature = await signPayload(testPayload, webhook.secret);

      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BTF-Signature": signature,
            "X-BTF-Event": "test",
          },
          body: testPayload,
        });

        return {
          success: response.ok,
          statusCode: response.status,
          statusText: response.statusText,
        };
      } catch (err: unknown) {
        return {
          success: false,
          statusCode: 0,
          statusText: err instanceof Error ? err.message : "Connection failed",
        };
      }
    }),
});
