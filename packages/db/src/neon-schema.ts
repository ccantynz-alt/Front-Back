import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  varchar,
  index,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Core Tables (PostgreSQL mirrors of Turso/LibSQL tables)
// ---------------------------------------------------------------------------

export const pgUsers = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("viewer"),
    passkeyCredentialId: text("passkey_credential_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const pgCredentials = pgTable(
  "credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: varchar("device_type", { length: 20 }).notNull(),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("credentials_credential_id_idx").on(table.credentialId),
    index("credentials_user_id_idx").on(table.userId),
  ],
);

export const pgSessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const pgSubscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    plan: varchar("plan", { length: 20 }).notNull().default("free"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_stripe_sub_id_idx").on(
      table.stripeSubscriptionId,
    ),
    index("subscriptions_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// PostgreSQL-Specific Tables (leverage full PG power)
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 20 }).notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    isPublished: boolean("is_published").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_type_idx").on(table.type),
    index("projects_is_deleted_idx").on(table.isDeleted),
  ],
);

export const pages = pgTable(
  "pages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().default({}),
    order: integer("order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("pages_project_id_idx").on(table.projectId),
    uniqueIndex("pages_project_slug_idx").on(table.projectId, table.slug),
    index("pages_order_idx").on(table.order),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 127 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("assets_project_id_idx").on(table.projectId),
    index("assets_user_id_idx").on(table.userId),
    uniqueIndex("assets_storage_key_idx").on(table.storageKey),
  ],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    messages: jsonb("messages")
      .$type<Array<{ role: string; content: string; timestamp: string }>>()
      .notNull()
      .default([]),
    model: varchar("model", { length: 100 }).notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_conversations_user_id_idx").on(table.userId),
    index("ai_conversations_project_id_idx").on(table.projectId),
  ],
);

export const vectorEmbeddings = pgTable(
  "vector_embeddings",
  {
    id: text("id").primaryKey(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    contentId: text("content_id").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vector_embeddings_content_type_idx").on(table.contentType),
    index("vector_embeddings_content_id_idx").on(table.contentId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const pgUsersRelations = relations(pgUsers, ({ many }) => ({
  credentials: many(pgCredentials),
  sessions: many(pgSessions),
  subscriptions: many(pgSubscriptions),
  projects: many(projects),
  assets: many(assets),
  aiConversations: many(aiConversations),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(pgUsers, { fields: [projects.userId], references: [pgUsers.id] }),
  pages: many(pages),
  assets: many(assets),
  aiConversations: many(aiConversations),
}));

export const pagesRelations = relations(pages, ({ one }) => ({
  project: one(projects, {
    fields: [pages.projectId],
    references: [projects.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  project: one(projects, {
    fields: [assets.projectId],
    references: [projects.id],
  }),
  user: one(pgUsers, { fields: [assets.userId], references: [pgUsers.id] }),
}));

export const aiConversationsRelations = relations(
  aiConversations,
  ({ one }) => ({
    user: one(pgUsers, {
      fields: [aiConversations.userId],
      references: [pgUsers.id],
    }),
    project: one(projects, {
      fields: [aiConversations.projectId],
      references: [projects.id],
    }),
  }),
);
