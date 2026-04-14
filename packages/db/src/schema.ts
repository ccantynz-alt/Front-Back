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

// ── Tenants ───────────────────────────────────────────────────────

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan", {
    enum: ["free", "pro", "enterprise"],
  }).notNull().default("free"),
  ownerEmail: text("owner_email").notNull(),
  customDomain: text("custom_domain"),
  status: text("status", {
    enum: ["provisioning", "active", "suspended", "deleting"],
  }).notNull().default("provisioning"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Feature Flags ─────────────────────────────────────────────────

export const featureFlags = sqliteTable("feature_flags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  rolloutPercent: integer("rollout_percent").notNull().default(0),
  allowList: text("allow_list"),
  denyList: text("deny_list"),
  updatedAt: text("updated_at"),
  updatedBy: text("updated_by"),
});

// ── Email Preferences ────────────────────────────────────────────

export const emailPreferences = sqliteTable("email_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weeklyDigest: integer("weekly_digest", { mode: "boolean" }).notNull().default(true),
  collaborationInvite: integer("collaboration_invite", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── AI Cache ──────────────────────────────────────────────────────
// Content-addressable cache for LLM/embedding responses. Keyed by
// SHA-256 of (model + prompt + params). Tenant-scoped.

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
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── UI Components Registry ────────────────────────────────────────
// Schema-first component catalog. Each row is a registered component
// with its JSON descriptor (Zod schema, props, slots, variants).

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

// ── AI Chat Conversations ─────────────────────────────────────────
// Persistent conversation threads for the internal Anthropic-powered
// chat interface. Each conversation tracks model, token usage, and
// cost so Craig can see exactly what the API spend looks like.

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  model: text("model").notNull().default("claude-sonnet-4-20250514"),
  systemPrompt: text("system_prompt"),
  totalTokens: integer("total_tokens").notNull().default(0),
  totalCost: integer("total_cost").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── User Provider Keys ────────────────────────────────────────────
// Encrypted storage for user-supplied API keys (Anthropic, OpenAI, etc).
// The key is encrypted at rest — only the prefix is stored in plaintext
// so users can identify which key they configured.

export const userProviderKeys = sqliteTable("user_provider_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", {
    enum: ["anthropic", "openai", "github"],
  }).notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Projects (Platform Hosting) ──────────────────────────────────
// Each project is a deployable application on the Crontech platform.

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  repoUrl: text("repo_url"),
  repoBranch: text("repo_branch").default("main"),
  framework: text("framework", {
    enum: ["solidstart", "nextjs", "remix", "astro", "hono", "static", "docker", "other"],
  }),
  buildCommand: text("build_command"),
  outputDir: text("output_dir"),
  installCommand: text("install_command").default("bun install"),
  runtime: text("runtime", {
    enum: ["bun", "node", "deno", "static"],
  }).default("bun"),
  port: integer("port").default(3000),
  status: text("status", {
    enum: ["creating", "active", "building", "deploying", "stopped", "error"],
  })
    .notNull()
    .default("creating"),
  lastDeployedAt: integer("last_deployed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Project Domains ──────────────────────────────────────────────

export const projectDomains = sqliteTable("project_domains", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  dnsVerified: integer("dns_verified", { mode: "boolean" }).notNull().default(false),
  dnsVerifiedAt: integer("dns_verified_at", { mode: "timestamp" }),
  tlsProvisioned: integer("tls_provisioned", { mode: "boolean" }).notNull().default(false),
  tlsProvisionedAt: integer("tls_provisioned_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Project Environment Variables ────────────────────────────────

export const projectEnvVars = sqliteTable("project_env_vars", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  environment: text("environment", {
    enum: ["production", "preview", "development"],
  })
    .notNull()
    .default("production"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Deployments ──────────────────────────────────────────────────

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  commitSha: text("commit_sha"),
  commitMessage: text("commit_message"),
  branch: text("branch").default("main"),
  status: text("status", {
    enum: ["queued", "building", "deploying", "live", "failed", "rolled_back"],
  })
    .notNull()
    .default("queued"),
  buildLog: text("build_log"),
  containerId: text("container_id"),
  containerImage: text("container_image"),
  url: text("url"),
  duration: integer("duration"),
  isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

// ── Flywheel Memory (BLK-017) ────────────────────────────────────────
// Every Claude Code session that touches this repo gets persisted here
// so future sessions can retrieve what was already learned. Source of
// truth is ~/.claude/projects/**/*.jsonl — packages/flywheel ingests
// those transcripts on every session-start and upserts into these
// tables. Content is redacted for secrets before insert.

export const flywheelSessions = sqliteTable("flywheel_sessions", {
  id: text("id").primaryKey(), // sessionId from the JSONL transcript
  cwd: text("cwd"),
  gitBranch: text("git_branch"),
  entrypoint: text("entrypoint"), // remote_mobile | cli | vscode | etc.
  version: text("version"),
  firstUserMessage: text("first_user_message"), // intent signal
  turnCount: integer("turn_count").notNull().default(0),
  compactCount: integer("compact_count").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  summary: text("summary"), // distilled by nightly summarizer (follow-on)
  ingestedAt: integer("ingested_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const flywheelTurns = sqliteTable("flywheel_turns", {
  id: text("id").primaryKey(), // uuid from the transcript
  sessionId: text("session_id")
    .notNull()
    .references(() => flywheelSessions.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(), // order within session
  role: text("role", {
    enum: ["user", "assistant", "system", "tool_use", "tool_result"],
  }).notNull(),
  content: text("content").notNull(), // redacted text (no secrets)
  toolName: text("tool_name"),
  parentUuid: text("parent_uuid"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

export const flywheelLessons = sqliteTable("flywheel_lessons", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => flywheelSessions.id, {
    onDelete: "set null",
  }),
  category: text("category", {
    enum: ["architecture", "doctrine", "bug_fix", "antipattern", "discovery", "decision"],
  }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tags: text("tags"), // JSON array
  sourceRefs: text("source_refs"), // JSON array of turn IDs
  confidence: integer("confidence").notNull().default(50), // 0..100
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Keystroke logger — opt-in, lean. Populated by editor wrappers and
// future CLI hooks. Keeps raw content small (char-level deltas, not
// full file bodies) and leaves large payloads to R2/blob if ever needed.
export const flywheelKeystrokes = sqliteTable("flywheel_keystrokes", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), // free-form (Claude session OR editor session)
  filePath: text("file_path"),
  eventType: text("event_type", {
    enum: ["keydown", "save", "open", "diff", "cursor", "selection"],
  }).notNull(),
  contentDelta: text("content_delta"),
  metadata: text("metadata"), // JSON
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Voice dispatch log (BLK-018) — every voice command the user issues
// lands here so we can replay, audit, and later fine-tune intent parsing.
export const flywheelVoiceCommands = sqliteTable("flywheel_voice_commands", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull(),
  intent: text("intent"), // parsed intent (JSON)
  action: text("action"), // resolved action (JSON)
  response: text("response"), // agent's text reply
  confidence: integer("confidence"), // 0..100
  status: text("status", {
    enum: ["parsed", "dispatched", "rejected", "failed"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
