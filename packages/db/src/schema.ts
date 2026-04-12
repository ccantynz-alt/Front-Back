import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "editor", "viewer"] })
    .notNull()
    .default("viewer"),
  passkeyCredentialId: text("passkey_credential_id"),
  passwordHash: text("password_hash"),
  authProvider: text("auth_provider", {
    enum: ["passkey", "password", "google"],
  }),
  googleId: text("google_id"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type", {
    enum: ["singleDevice", "multiDevice"],
  }).notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  transports: text("transports"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Billing Tables ───────────────────────────────────────────────────

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stripePriceId: text("stripe_price_id").notNull().unique(),
  price: integer("price").notNull(),
  interval: text("interval", { enum: ["monthly", "yearly"] }).notNull(),
  features: text("features"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripePriceId: text("stripe_price_id").notNull(),
  status: text("status", {
    enum: ["active", "canceled", "past_due", "trialing"],
  }).notNull(),
  currentPeriodStart: integer("current_period_start", {
    mode: "timestamp",
  }).notNull(),
  currentPeriodEnd: integer("current_period_end", {
    mode: "timestamp",
  }).notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Tenant Projects (Multi-Tenant Neon Provisioning) ─────────────────

export const tenantProjects = sqliteTable("tenant_projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  neonProjectId: text("neon_project_id").notNull().unique(),
  connectionUri: text("connection_uri").notNull(),
  region: text("region").notNull().default("aws-us-east-2"),
  status: text("status", {
    enum: ["provisioning", "active", "suspended", "deleting"],
  }).notNull(),
  plan: text("plan", {
    enum: ["free", "pro", "enterprise"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── API Keys ────────────────────────────────────────────────────────

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  name: text("name").notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── User Webhooks ───────────────────────────────────────────────────

export const userWebhooks = sqliteTable("user_webhooks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  url: text("url").notNull(),
  events: text("events").notNull(),
  secret: text("secret").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Webhook Deliveries ──────────────────────────────────────────────
// Every outbound webhook POST goes through this table. The dispatcher
// loop (apps/api/src/webhooks/dispatcher.ts) selects pending rows whose
// `next_retry_at` is due, POSTs them, and transitions them to
// `delivered` or `failed`. Idempotent by design: a crashed dispatcher
// leaves unmarked rows that the next run picks up.

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id")
    .notNull()
    .references(() => userWebhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: text("payload").notNull(),
  status: text("status", {
    enum: ["pending", "delivered", "failed"],
  })
    .notNull()
    .default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  lastStatusCode: integer("last_status_code"),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Audit Logs ───────────────────────────────────────────────────────

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  actorId: text("actor_id").notNull(),
  actorIp: text("actor_ip"),
  actorDevice: text("actor_device"),
  action: text("action", {
    enum: ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "SIGN"],
  }).notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  detail: text("detail"),
  result: text("result", { enum: ["success", "failure"] }).notNull(),
  sessionId: text("session_id"),
  previousHash: text("previous_hash"),
  entryHash: text("entry_hash").notNull(),
  signature: text("signature"),
});

// ── Notifications ────────────────────────────────────────────────────

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["system", "billing", "collaboration", "ai"],
  }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Support Tickets (AI Email Support) ──────────────────────────────

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  fromEmail: text("from_email").notNull(),
  subject: text("subject").notNull(),
  category: text("category", {
    enum: ["billing", "technical", "bug", "feature", "sales", "spam", "other"],
  })
    .notNull()
    .default("other"),
  status: text("status", {
    enum: ["new", "ai_drafted", "awaiting_review", "sent", "resolved", "escalated"],
  })
    .notNull()
    .default("new"),
  aiConfidence: integer("ai_confidence"),
  aiDraft: text("ai_draft"),
  finalResponse: text("final_response"),
  threadId: text("thread_id"),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] })
    .notNull()
    .default("medium"),
  assignedTo: text("assigned_to").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  body: text("body").notNull(),
  bodyHtml: text("body_html"),
  sentByAi: integer("sent_by_ai", { mode: "boolean" }).notNull().default(false),
  sentAt: integer("sent_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const analyticsEvents = sqliteTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  event: text("event").notNull(),
  category: text("category", {
    enum: ["page_view", "feature_usage", "ai_generation", "time_on_page"],
  }).notNull(),
  properties: text("properties"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Sites & Site Versions (AI Site Builder output) ──────────────────
// Persists the PageLayout objects produced by the site builder agent.
// Each `sites` row is a logical site owned by a user; `site_versions`
// is an append-only history of generated/edited layouts for that site.
// Layouts are stored as JSON text (serialized PageLayout from
// @back-to-the-future/ai-core).

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status", {
    enum: ["draft", "published", "archived"],
  })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const siteVersions = sqliteTable("site_versions", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  prompt: text("prompt"),
  layout: text("layout").notNull(),
  generatedBy: text("generated_by", {
    enum: ["ai", "user", "mixed"],
  })
    .notNull()
    .default("ai"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── AI Response Cache ──────────────────────────────────────────────
// Content-addressable cache for LLM/embedding calls. Tenant-scoped
// so cache hits never leak across customers. Used by the
// cachedAICall() wrapper in apps/api/src/ai/cache.ts.

export const aiCache = sqliteTable("ai_cache", {
  cacheKey: text("cache_key").primaryKey(),
  tenantId: text("tenant_id"),
  model: text("model").notNull(),
  promptHash: text("prompt_hash").notNull(),
  responseJson: text("response_json").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  costUsd: integer("cost_usd").notNull().default(0),
  hitCount: integer("hit_count").notNull().default(0),
  lastHitAt: integer("last_hit_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── UI Component Catalog ───────────────────────────────────────────
// Schema-first component registry for the generative-UI system.
// AI agents and deterministic composers read from this catalog to
// assemble validated component trees.

// ── Files (R2 File Storage Metadata) ──────────────────────────────────
// Tracks files uploaded to Cloudflare R2. Each row maps a logical file
// to its R2 object key. Tenant-scoped via `tenantId`.

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  key: text("key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── UI Component Catalog ───────────────────────────────────────────
// Schema-first component registry for the generative-UI system.
// AI agents and deterministic composers read from this catalog to
// assemble validated component trees.

export const uiComponents = sqliteTable("ui_components", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  descriptorJson: text("descriptor_json").notNull(),
  registeredBy: text("registered_by"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
