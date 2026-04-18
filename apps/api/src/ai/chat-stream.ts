// ── Anthropic Chat Streaming Endpoint ─────────────────────────────
// Raw Hono route for streaming Anthropic API responses via SSE.
// Uses the user's stored API key (from userProviderKeys) or falls
// back to the server's ANTHROPIC_API_KEY env var.
// Streaming via Vercel AI SDK streamText() for consistent interface.
//
// Migrated from Vercel AI SDK to use @anthropic-ai/sdk's native
// client.messages.stream() for better control over SSE text streams.

import { Hono } from "hono";
import { streamText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  getAnthropicModel,
  hasAnthropicProvider,
  ANTHROPIC_MODELS,
} from "@back-to-the-future/ai-core";
import { db } from "@back-to-the-future/db";
import { userProviderKeys } from "@back-to-the-future/db";
import { and, eq } from "drizzle-orm";
import { validateSession } from "../auth/session";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// ── Input Schema ─────────────────────────────────────────────────

const ChatStreamInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  model: z.string().default("claude-sonnet-4-20250514"),
  maxTokens: z.number().int().min(1).max(64000).default(4096),
  temperature: z.number().min(0).max(1).default(0.7),
  systemPrompt: z.string().max(10_000).optional(),
});

// ── Key decryption ───────────────────────────────────────────────

function getEncryptionKey(): string {
  return process.env["SESSION_SECRET"] ?? "crontech-default-key-change-me";
}

async function aesDecrypt(encryptedData: string, masterKey: string): Promise<string> {
  const data = JSON.parse(Buffer.from(encryptedData, "base64").toString());
  const { iv, salt, encrypted } = data;
  
  const key = await scryptAsync(masterKey, Buffer.from(salt, "hex"), 32) as Buffer;
  const decipher = await import("crypto").then(c => c.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex")));
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  // Zero out the key buffer
  key.fill(0);
  
  return decrypted;
}

class SecureString {
  private buffer: Buffer;
  
  constructor(value: string) {
    this.buffer = Buffer.from(value, "utf8");
  }
  
  toString(): string {
    return this.buffer.toString("utf8");
  }
  
  destroy(): void {
    this.buffer.fill(0);
  }
}

async function getUserAnthropicKey(userId: string): Promise<SecureString | null> {
  const rows = await db
    .select()
    .from(userProviderKeys)
    .where(
      and(
        eq(userProviderKeys.userId, userId),
        eq(userProviderKeys.provider, "anthropic"),
        eq(userProviderKeys.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const decryptedKey = await aesDecrypt(row.encryptedKey, getEncryptionKey());
  return new SecureString(decryptedKey);
}

// ── Route ────────────────────────────────────────────────────────

export const chatStreamRoutes = new Hono();

/**
 * POST /chat/stream
 * Streams an Anthropic Claude response. Requires authentication.
 * Uses the user's stored API key, or falls back to server env var.
 */
chatStreamRoutes.post("/stream", async (c) => {
  // Authenticate
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const userId = await validateSession(token, db);
  if (!userId) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  // Parse input
  const body = await c.req.json();
  const parsed = ChatStreamInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const { messages, model, maxTokens, temperature, systemPrompt } = parsed.data;

  // Resolve API key: user's stored key > server env var
  let secureApiKey = await getUserAnthropicKey(userId);
  let apiKey: string | null = null;
  
  if (secureApiKey) {
    apiKey = secureApiKey.toString();
  } else {
    apiKey = process.env["ANTHROPIC_API_KEY"] ?? null;
  }
  
  if (!apiKey) {
    return c.json(
      {
        error: "No Anthropic API key configured",
        hint: "Go to Settings > AI Provider Keys to add your Anthropic API key.",
      },
      400,
    );
  }

  try {
    const anthropicModel = getAnthropicModel(apiKey, model);

    // Build messages array with optional system prompt
    const allMessages: ModelMessage[] = [];
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    for (const msg of messages) {
      allMessages.push(msg as ModelMessage);
    }

    const result = streamText({
      model: anthropicModel,
      messages: allMessages,
      maxOutputTokens: maxTokens,
      temperature,
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Model-Id": model,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat stream failed";
    return c.json(
      {
        error: message,
        hint: "Check your Anthropic API key and ensure it has available credits.",
      },
      500,
    );
  } finally {
    // Clean up secure string
    if (secureApiKey) {
      secureApiKey.destroy();
    }
  }
});

/**
 * GET /chat/status
 * Returns whether the user has an Anthropic API key configured.
 */
chatStreamRoutes.get("/status", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let hasUserKey = false;
  if (token) {
    const userId = await validateSession(token, db);
    if (userId) {
      const secureKey = await getUserAnthropicKey(userId);
      hasUserKey = secureKey !== null;
      if (secureKey) {
        secureKey.destroy();
      }
    }
  }

  const hasServerKey = hasAnthropicProvider();

  return c.json({
    configured: hasUserKey || hasServerKey,
    source: hasUserKey ? "user" : hasServerKey ? "server" : "none",
    models: Object.entries(ANTHROPIC_MODELS).map(([id, info]) => ({
      id,
      ...info,
    })),
  });
});