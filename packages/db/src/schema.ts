import { blob, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  emailVerified: integer("email_verified", { mode: "timestamp" }),
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

// ── Billing Tables ───────────────────────────────────

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
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
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

// ── Audit Logs ──────────────────────────────────────────────────────────

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  actorId: text("actor_id").notNull(),
  actorIp: text("actor_ip"),
  actorDevice: text("actor_device"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  detail: text("detail"),
  result: text("result").notNull(),
  sessionId: text("session_id"),
  previousHash: text("previous_hash"),
  entryHash: text("entry_hash").notNull(),
  signature: text("signature"),
});

// ── Tenant Projects (Multi-Tenant Neon Provisioning) ───────────────────

export const tenantProjects = sqliteTable("tenant_projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  neonProjectId: text("neon_project_id").notNull().unique(),
  connectionUri: text("connection_uri").notNull(),
  region: text("region").notNull().default("aws-us-east-2"),
  status: text("status", {
    enum: ["provisioning", "active", "suspended", "deleting", "deleted"],
  }).notNull(),
  plan: text("plan", { enum: ["free", "pro", "enterprise"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── API Keys ────────────────────────────────────────────────────────────

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

// ── User Webhooks ───────────────────────────────────────────────────────

export const userWebhooks = sqliteTable("user_webhooks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: text("events").notNull(),
  secret: text("secret").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Webhook Deliveries ──────────────────────────────────────────────────

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id")
    .notNull()
    .references(() => userWebhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  lastStatusCode: integer("last_status_code"),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp" }).notNull(),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Support ─────────────────────────────────────────────────────────────

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  fromEmail: text("from_email").notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull().default("other"),
  status: text("status").notNull().default("new"),
  aiConfidence: integer("ai_confidence"),
  aiDraft: text("ai_draft"),
  finalResponse: text("final_response"),
  threadId: text("thread_id"),
  priority: text("priority").notNull().default("medium"),
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

// ── Notifications ───────────────────────────────────────────────────────

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type"),
  title: text("title").notNull(),
  message: text("message"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Analytics Events ────────────────────────────────────────────────────

export const analyticsEvents = sqliteTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  event: text("event").notNull(),
  category: text("category"),
  properties: text("properties"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Sites & Versions ────────────────────────────────────────────────────

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
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
  generatedBy: text("generated_by").notNull().default("ai"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── UI Components Registry ──────────────────────────────────────────────

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

// ── AI Cache ────────────────────────────────────────────────────────────

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
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// ── Tenants ─────────────────────────────────────────────────────────────

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  ownerEmail: text("owner_email").notNull(),
  customDomain: text("custom_domain"),
  status: text("status").notNull().default("provisioning"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Feature Flags & Email Preferences ──────────────────────────────────

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

export const emailPreferences = sqliteTable("email_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weeklyDigest: integer("weekly_digest", { mode: "boolean" }).notNull().default(true),
  collaborationInvite: integer("collaboration_invite", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Chat & Provider Keys ────────────────────────────────────────────────

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
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userProviderKeys = sqliteTable("user_provider_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Projects, Domains & Deployments ────────────────────────────────────

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
  framework: text("framework"),
  buildCommand: text("build_command"),
  outputDir: text("output_dir"),
  installCommand: text("install_command").default("bun install"),
  runtime: text("runtime").default("bun"),
  port: integer("port").default(3000),
  status: text("status").notNull().default("creating"),
  lastDeployedAt: integer("last_deployed_at", { mode: "timestamp" }),
  source: text("source"),
  originUrl: text("origin_url"),
  detectedStack: text("detected_stack"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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

export const projectEnvVars = sqliteTable("project_env_vars", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  environment: text("environment").notNull().default("production"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
  status: text("status").notNull().default("queued"),
  buildLog: text("build_log"),
  containerId: text("container_id"),
  containerImage: text("container_image"),
  url: text("url"),
  duration: integer("duration"),
  isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
  commitAuthor: text("commit_author"),
  deployUrl: text("deploy_url"),
  buildDuration: integer("build_duration"),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by").notNull().default("manual"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  cancelRequestedAt: integer("cancel_requested_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const deploymentLogs = sqliteTable("deployment_logs", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),
  stream: text("stream").notNull().default("stdout"),
  line: text("line").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Flywheel (Session Memory) ───────────────────────────────────────────

export const flywheelSessions = sqliteTable("flywheel_sessions", {
  id: text("id").primaryKey(),
  cwd: text("cwd"),
  gitBranch: text("git_branch"),
  entrypoint: text("entrypoint"),
  version: text("version"),
  firstUserMessage: text("first_user_message"),
  turnCount: integer("turn_count").notNull().default(0),
  compactCount: integer("compact_count").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  summary: text("summary"),
  ingestedAt: integer("ingested_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const flywheelTurns = sqliteTable("flywheel_turns", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => flywheelSessions.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolName: text("tool_name"),
  parentUuid: text("parent_uuid"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const flywheelLessons = sqliteTable("flywheel_lessons", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => flywheelSessions.id, {
    onDelete: "set null",
  }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tags: text("tags"),
  sourceRefs: text("source_refs"),
  confidence: integer("confidence").notNull().default(50),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const flywheelKeystrokes = sqliteTable("flywheel_keystrokes", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  filePath: text("file_path"),
  eventType: text("event_type").notNull(),
  contentDelta: text("content_delta"),
  metadata: text("metadata"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const flywheelVoiceCommands = sqliteTable("flywheel_voice_commands", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull(),
  intent: text("intent"),
  action: text("action"),
  response: text("response"),
  confidence: integer("confidence"),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Build Theatre (CI Logs) ─────────────────────────────────────────────

export const buildRuns = sqliteTable("build_runs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("queued"),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorLabel: text("actor_label"),
  gitBranch: text("git_branch"),
  gitSha: text("git_sha"),
  metadata: text("metadata"),
  error: text("error"),
  cancelRequestedAt: integer("cancel_requested_at", { mode: "timestamp" }),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp" }),
});

export const buildSteps = sqliteTable("build_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => buildRuns.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("queued"),
  exitCode: integer("exit_code"),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
});

export const buildLogs = sqliteTable("build_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => buildRuns.id, { onDelete: "cascade" }),
  stepId: text("step_id").references(() => buildSteps.id, {
    onDelete: "cascade",
  }),
  seq: integer("seq").notNull(),
  stream: text("stream").notNull().default("stdout"),
  line: text("line").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Tenant Git Repos ────────────────────────────────────────────────────

export const tenantGitRepos = sqliteTable("tenant_git_repos", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  repository: text("repository").notNull().unique(),
  appName: text("app_name").notNull(),
  branch: text("branch").notNull().default("main"),
  domain: text("domain").notNull(),
  port: integer("port").notNull(),
  runtime: text("runtime").notNull(),
  envVars: text("env_vars"),
  autoDeploy: integer("auto_deploy", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Usage & Billing ─────────────────────────────────────────────────────

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").notNull(),
  quantity: integer("quantity").notNull(),
  unit: text("unit").notNull(),
  metadata: text("metadata"),
  occurredAt: integer("occurred_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  billingMonth: text("billing_month").notNull(),
});

export const usageReports = sqliteTable("usage_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  billingMonth: text("billing_month").notNull(),
  eventType: text("event_type").notNull(),
  reportedQuantity: integer("reported_quantity").notNull().default(0),
  stripeSubscriptionItemId: text("stripe_subscription_item_id").notNull(),
  lastStripeUsageRecordId: text("last_stripe_usage_record_id"),
  lastReportedAt: integer("last_reported_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const billingAccounts = sqliteTable("billing_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const billingEvents = sqliteTable("billing_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  processedAt: integer("processed_at", { mode: "timestamp" }),
});

export const buildMinutesUsage = sqliteTable("build_minutes_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deploymentId: text("deployment_id")
    .notNull()
    .references(() => deployments.id, { onDelete: "cascade" }),
  minutesUsed: real("minutes_used").notNull(),
  recordedAt: integer("recorded_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  reportedToStripeAt: integer("reported_to_stripe_at", { mode: "timestamp" }),
});

// ── DNS ─────────────────────────────────────────────────────────────────

export const dnsZones = sqliteTable("dns_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  adminEmail: text("admin_email").notNull(),
  primaryNs: text("primary_ns").notNull(),
  secondaryNs: text("secondary_ns"),
  refreshSeconds: integer("refresh_seconds").notNull().default(3600),
  retrySeconds: integer("retry_seconds").notNull().default(600),
  expireSeconds: integer("expire_seconds").notNull().default(604800),
  minimumTtl: integer("minimum_ttl").notNull().default(300),
  serial: integer("serial").notNull().default(1),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const dnsRecords = sqliteTable("dns_records", {
  id: text("id").primaryKey(),
  zoneId: text("zone_id")
    .notNull()
    .references(() => dnsZones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  ttl: integer("ttl").notNull().default(300),
  priority: integer("priority"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

// ── Domain Registrations ────────────────────────────────────────────────

export const domainRegistrations = sqliteTable("domain_registrations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  tld: text("tld").notNull(),
  registeredAt: integer("registered_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  autoRenew: integer("auto_renew", { mode: "boolean" }).notNull().default(false),
  opensrsHandle: text("opensrs_handle"),
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  markupMicrodollars: integer("markup_microdollars").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── eSIM ────────────────────────────────────────────────────────────────

export const esimOrders = sqliteTable("esim_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packageId: text("package_id").notNull(),
  providerOrderId: text("provider_order_id").notNull(),
  countryCode: text("country_code"),
  dataGb: integer("data_gb").notNull().default(0),
  validityDays: integer("validity_days").notNull().default(0),
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  markupMicrodollars: integer("markup_microdollars").notNull().default(0),
  status: text("status").notNull().default("pending"),
  iccid: text("iccid"),
  lpaString: text("lpa_string"),
  qrCodeDataUrl: text("qr_code_data_url"),
  purchasedAt: integer("purchased_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const esimPackagesCache = sqliteTable("esim_packages_cache", {
  id: text("id").primaryKey(),
  providerPackageId: text("provider_package_id").notNull().unique(),
  countryCode: text("country_code"),
  name: text("name").notNull(),
  dataGb: integer("data_gb").notNull().default(0),
  validityDays: integer("validity_days").notNull().default(0),
  wholesaleMicrodollars: integer("wholesale_microdollars").notNull().default(0),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── SMS ─────────────────────────────────────────────────────────────────

export const smsMessages = sqliteTable("sms_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  body: text("body").notNull(),
  segments: integer("segments").notNull().default(1),
  status: text("status").notNull(),
  providerMessageId: text("provider_message_id"),
  costMicrodollars: integer("cost_microdollars").notNull().default(0),
  markupMicrodollars: integer("markup_microdollars").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const smsNumbers = sqliteTable("sms_numbers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  e164Number: text("e164_number").notNull().unique(),
  countryCode: text("country_code").notNull(),
  sinchNumberId: text("sinch_number_id").notNull(),
  capabilities: text("capabilities").notNull().default('["sms"]'),
  monthlyCostMicrodollars: integer("monthly_cost_microdollars").notNull().default(0),
  purchasedAt: integer("purchased_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  releasedAt: integer("released_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const smsWebhookSubscriptions = sqliteTable("sms_webhook_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  e164Number: text("e164_number").notNull(),
  customerWebhookUrl: text("customer_webhook_url").notNull(),
  hmacSecret: text("hmac_secret").notNull(),
  events: text("events").notNull().default('["inbound"]'),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Universal Credits ─────────────────────────────────────────────────────
// One row per user. Balance is stored in integer cents (1 credit = $0.01).
// Negative balance is allowed for grace-period overdraft.
export const creditBalances = sqliteTable("credit_balances", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balanceCents: integer("balance_cents").notNull().default(0),
  lifetimeEarnedCents: integer("lifetime_earned_cents").notNull().default(0),
  lifetimeSpentCents: integer("lifetime_spent_cents").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// One row per transaction (earn, spend, refund, adjustment).
export const creditTransactions = sqliteTable("credit_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(), // positive = credit, negative = debit
  kind: text("kind", { enum: ["earn", "spend", "refund", "adjustment", "signup_bonus"] }).notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"), // deployment ID, invoice ID, etc.
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ── Auth Challenges ─────────────────────────────────────────────────────

export const authChallenges = sqliteTable("auth_challenges", {
  key: text("key").primaryKey(), // e.g. "reg:userId" or "auth:discoverable:xyz"
  challenge: text("challenge").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Email Verification ──────────────────────────────────────────────────

export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
