import { describe, test, expect } from "bun:test";
import {
  users,
  auditLogs,
  credentials,
  sessions,
  plans,
  subscriptions,
  payments,
  tenantProjects,
  apiKeys,
  userWebhooks,
  notifications,
  supportTickets,
  supportMessages,
  analyticsEvents,
} from "./schema";
import { getTableName, getTableColumns } from "drizzle-orm";

// ── users table ──────────────────────────────────────────────────────

describe("users table schema", () => {
  test("table is named 'users'", () => {
    expect(getTableName(users)).toBe("users");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(users);
    const columnNames = Object.keys(columns);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("email");
    expect(columnNames).toContain("displayName");
    expect(columnNames).toContain("role");
    expect(columnNames).toContain("passkeyCredentialId");
    expect(columnNames).toContain("createdAt");
    expect(columnNames).toContain("updatedAt");
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(users);
    expect(columns.id.primary).toBe(true);
  });

  test("email is not nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.email.notNull).toBe(true);
  });

  test("email is unique", () => {
    const columns = getTableColumns(users);
    expect(columns.email.isUnique).toBe(true);
  });

  test("displayName is not nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.displayName.notNull).toBe(true);
  });

  test("role is not nullable and has a default", () => {
    const columns = getTableColumns(users);
    expect(columns.role.notNull).toBe(true);
    expect(columns.role.hasDefault).toBe(true);
  });

  test("passkeyCredentialId is nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.passkeyCredentialId.notNull).toBe(false);
  });

  test("createdAt is not nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.createdAt.notNull).toBe(true);
  });

  test("updatedAt is not nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.updatedAt.notNull).toBe(true);
  });

  test("has exactly 12 columns", () => {
    const columns = getTableColumns(users);
    expect(Object.keys(columns).length).toBe(12);
  });

  test("has auth provider columns", () => {
    const columns = getTableColumns(users);
    expect(columns.passwordHash).toBeDefined();
    expect(columns.authProvider).toBeDefined();
    expect(columns.googleId).toBeDefined();
    expect(columns.avatarUrl).toBeDefined();
  });
});

// ── auditLogs table ──────────────────────────────────────────────────

describe("auditLogs table schema", () => {
  test("table is named 'audit_logs'", () => {
    expect(getTableName(auditLogs)).toBe("audit_logs");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(auditLogs);
    const expectedColumns = [
      "id",
      "timestamp",
      "actorId",
      "actorIp",
      "actorDevice",
      "action",
      "resourceType",
      "resourceId",
      "detail",
      "result",
      "sessionId",
      "previousHash",
      "entryHash",
      "signature",
    ];
    for (const col of expectedColumns) {
      expect(Object.keys(columns)).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(auditLogs);
    expect(columns.id.primary).toBe(true);
  });

  test("required fields are not nullable", () => {
    const columns = getTableColumns(auditLogs);
    const requiredFields = [
      "id",
      "timestamp",
      "actorId",
      "action",
      "resourceType",
      "resourceId",
      "result",
      "entryHash",
    ];
    for (const field of requiredFields) {
      const col = (columns as Record<string, { notNull: boolean }>)[field];
      expect(col?.notNull).toBe(true);
    }
  });

  test("optional fields are nullable", () => {
    const columns = getTableColumns(auditLogs);
    const optionalFields = [
      "actorIp",
      "actorDevice",
      "detail",
      "sessionId",
      "previousHash",
      "signature",
    ];
    for (const field of optionalFields) {
      const col = (columns as Record<string, { notNull: boolean }>)[field];
      expect(col?.notNull).toBe(false);
    }
  });

  test("has exactly 14 columns", () => {
    const columns = getTableColumns(auditLogs);
    expect(Object.keys(columns).length).toBe(14);
  });
});

// ── credentials table ───────────────────────────────────────────────

describe("credentials table schema", () => {
  test("table is named 'credentials'", () => {
    expect(getTableName(credentials)).toBe("credentials");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(credentials);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("credentialId");
    expect(names).toContain("publicKey");
    expect(names).toContain("counter");
    expect(names).toContain("deviceType");
    expect(names).toContain("backedUp");
    expect(names).toContain("transports");
    expect(names).toContain("createdAt");
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(credentials);
    expect(columns.id.primary).toBe(true);
  });

  test("credentialId is unique", () => {
    const columns = getTableColumns(credentials);
    expect(columns.credentialId.isUnique).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(credentials);
    expect(columns.userId.notNull).toBe(true);
  });

  test("has exactly 9 columns", () => {
    const columns = getTableColumns(credentials);
    expect(Object.keys(columns).length).toBe(9);
  });
});

// ── sessions table ──────────────────────────────────────────────────

describe("sessions table schema", () => {
  test("table is named 'sessions'", () => {
    expect(getTableName(sessions)).toBe("sessions");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(sessions);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("token");
    expect(names).toContain("expiresAt");
    expect(names).toContain("createdAt");
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(sessions);
    expect(columns.id.primary).toBe(true);
  });

  test("token is unique", () => {
    const columns = getTableColumns(sessions);
    expect(columns.token.isUnique).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(sessions);
    expect(columns.userId.notNull).toBe(true);
  });

  test("has exactly 5 columns", () => {
    const columns = getTableColumns(sessions);
    expect(Object.keys(columns).length).toBe(5);
  });
});

// ── plans table ─────────────────────────────────────────────────────

describe("plans table schema", () => {
  test("table is named 'plans'", () => {
    expect(getTableName(plans)).toBe("plans");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(plans);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("name");
    expect(names).toContain("description");
    expect(names).toContain("stripePriceId");
    expect(names).toContain("price");
    expect(names).toContain("interval");
    expect(names).toContain("features");
    expect(names).toContain("isActive");
    expect(names).toContain("createdAt");
  });

  test("stripePriceId is unique", () => {
    const columns = getTableColumns(plans);
    expect(columns.stripePriceId.isUnique).toBe(true);
  });

  test("name is not nullable", () => {
    const columns = getTableColumns(plans);
    expect(columns.name.notNull).toBe(true);
  });

  test("price is not nullable", () => {
    const columns = getTableColumns(plans);
    expect(columns.price.notNull).toBe(true);
  });

  test("has exactly 9 columns", () => {
    const columns = getTableColumns(plans);
    expect(Object.keys(columns).length).toBe(9);
  });
});

// ── subscriptions table ─────────────────────────────────────────────

describe("subscriptions table schema", () => {
  test("table is named 'subscriptions'", () => {
    expect(getTableName(subscriptions)).toBe("subscriptions");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(subscriptions);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("stripeCustomerId");
    expect(names).toContain("stripeSubscriptionId");
    expect(names).toContain("stripePriceId");
    expect(names).toContain("status");
    expect(names).toContain("currentPeriodStart");
    expect(names).toContain("currentPeriodEnd");
    expect(names).toContain("cancelAtPeriodEnd");
    expect(names).toContain("createdAt");
    expect(names).toContain("updatedAt");
  });

  test("stripeSubscriptionId is unique", () => {
    const columns = getTableColumns(subscriptions);
    expect(columns.stripeSubscriptionId.isUnique).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(subscriptions);
    expect(columns.userId.notNull).toBe(true);
  });

  test("has exactly 11 columns", () => {
    const columns = getTableColumns(subscriptions);
    expect(Object.keys(columns).length).toBe(11);
  });
});

// ── payments table ──────────────────────────────────────────────────

describe("payments table schema", () => {
  test("table is named 'payments'", () => {
    expect(getTableName(payments)).toBe("payments");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(payments);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("stripePaymentIntentId");
    expect(names).toContain("amount");
    expect(names).toContain("currency");
    expect(names).toContain("status");
    expect(names).toContain("createdAt");
  });

  test("stripePaymentIntentId is unique", () => {
    const columns = getTableColumns(payments);
    expect(columns.stripePaymentIntentId.isUnique).toBe(true);
  });

  test("amount is not nullable", () => {
    const columns = getTableColumns(payments);
    expect(columns.amount.notNull).toBe(true);
  });

  test("has exactly 7 columns", () => {
    const columns = getTableColumns(payments);
    expect(Object.keys(columns).length).toBe(7);
  });
});

// ── tenantProjects table ────────────────────────────────────────────

describe("tenantProjects table schema", () => {
  test("table is named 'tenant_projects'", () => {
    expect(getTableName(tenantProjects)).toBe("tenant_projects");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(tenantProjects);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("neonProjectId");
    expect(names).toContain("connectionUri");
    expect(names).toContain("region");
    expect(names).toContain("status");
    expect(names).toContain("plan");
    expect(names).toContain("createdAt");
    expect(names).toContain("updatedAt");
  });

  test("neonProjectId is unique", () => {
    const columns = getTableColumns(tenantProjects);
    expect(columns.neonProjectId.isUnique).toBe(true);
  });

  test("has exactly 9 columns", () => {
    const columns = getTableColumns(tenantProjects);
    expect(Object.keys(columns).length).toBe(9);
  });
});

// ── apiKeys table ───────────────────────────────────────────────────

describe("apiKeys table schema", () => {
  test("table is named 'api_keys'", () => {
    expect(getTableName(apiKeys)).toBe("api_keys");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(apiKeys);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("keyHash");
    expect(names).toContain("prefix");
    expect(names).toContain("name");
    expect(names).toContain("lastUsedAt");
    expect(names).toContain("expiresAt");
    expect(names).toContain("createdAt");
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(apiKeys);
    expect(columns.userId.notNull).toBe(true);
  });

  test("has exactly 8 columns", () => {
    const columns = getTableColumns(apiKeys);
    expect(Object.keys(columns).length).toBe(8);
  });
});

// ── userWebhooks table ──────────────────────────────────────────────

describe("userWebhooks table schema", () => {
  test("table is named 'user_webhooks'", () => {
    expect(getTableName(userWebhooks)).toBe("user_webhooks");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(userWebhooks);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("url");
    expect(names).toContain("events");
    expect(names).toContain("secret");
    expect(names).toContain("isActive");
    expect(names).toContain("createdAt");
  });

  test("url is not nullable", () => {
    const columns = getTableColumns(userWebhooks);
    expect(columns.url.notNull).toBe(true);
  });

  test("has exactly 7 columns", () => {
    const columns = getTableColumns(userWebhooks);
    expect(Object.keys(columns).length).toBe(7);
  });
});

// ── notifications table ─────────────────────────────────────────────

describe("notifications table schema", () => {
  test("table is named 'notifications'", () => {
    expect(getTableName(notifications)).toBe("notifications");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(notifications);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("type");
    expect(names).toContain("title");
    expect(names).toContain("message");
    expect(names).toContain("read");
    expect(names).toContain("metadata");
    expect(names).toContain("createdAt");
  });

  test("title is not nullable", () => {
    const columns = getTableColumns(notifications);
    expect(columns.title.notNull).toBe(true);
  });

  test("read has a default value", () => {
    const columns = getTableColumns(notifications);
    expect(columns.read.hasDefault).toBe(true);
  });

  test("has exactly 8 columns", () => {
    const columns = getTableColumns(notifications);
    expect(Object.keys(columns).length).toBe(8);
  });
});

// ── supportTickets table ────────────────────────────────────────────

describe("supportTickets table schema", () => {
  test("table is named 'support_tickets'", () => {
    expect(getTableName(supportTickets)).toBe("support_tickets");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(supportTickets);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("fromEmail");
    expect(names).toContain("subject");
    expect(names).toContain("category");
    expect(names).toContain("status");
    expect(names).toContain("aiConfidence");
    expect(names).toContain("aiDraft");
    expect(names).toContain("finalResponse");
    expect(names).toContain("threadId");
    expect(names).toContain("priority");
    expect(names).toContain("assignedTo");
    expect(names).toContain("createdAt");
    expect(names).toContain("updatedAt");
    expect(names).toContain("resolvedAt");
  });

  test("fromEmail is not nullable", () => {
    const columns = getTableColumns(supportTickets);
    expect(columns.fromEmail.notNull).toBe(true);
  });

  test("subject is not nullable", () => {
    const columns = getTableColumns(supportTickets);
    expect(columns.subject.notNull).toBe(true);
  });

  test("has exactly 15 columns", () => {
    const columns = getTableColumns(supportTickets);
    expect(Object.keys(columns).length).toBe(15);
  });
});

// ── supportMessages table ───────────────────────────────────────────

describe("supportMessages table schema", () => {
  test("table is named 'support_messages'", () => {
    expect(getTableName(supportMessages)).toBe("support_messages");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(supportMessages);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("ticketId");
    expect(names).toContain("direction");
    expect(names).toContain("fromAddress");
    expect(names).toContain("toAddress");
    expect(names).toContain("body");
    expect(names).toContain("bodyHtml");
    expect(names).toContain("sentByAi");
    expect(names).toContain("sentAt");
  });

  test("ticketId is not nullable", () => {
    const columns = getTableColumns(supportMessages);
    expect(columns.ticketId.notNull).toBe(true);
  });

  test("body is not nullable", () => {
    const columns = getTableColumns(supportMessages);
    expect(columns.body.notNull).toBe(true);
  });

  test("has exactly 9 columns", () => {
    const columns = getTableColumns(supportMessages);
    expect(Object.keys(columns).length).toBe(9);
  });
});

// ── analyticsEvents table ───────────────────────────────────────────

describe("analyticsEvents table schema", () => {
  test("table is named 'analytics_events'", () => {
    expect(getTableName(analyticsEvents)).toBe("analytics_events");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(analyticsEvents);
    const names = Object.keys(columns);
    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("sessionId");
    expect(names).toContain("event");
    expect(names).toContain("category");
    expect(names).toContain("properties");
    expect(names).toContain("timestamp");
  });

  test("event is not nullable", () => {
    const columns = getTableColumns(analyticsEvents);
    expect(columns.event.notNull).toBe(true);
  });

  test("userId is nullable (anonymous events)", () => {
    const columns = getTableColumns(analyticsEvents);
    expect(columns.userId.notNull).toBe(false);
  });

  test("has exactly 7 columns", () => {
    const columns = getTableColumns(analyticsEvents);
    expect(Object.keys(columns).length).toBe(7);
  });
});

// ── Cross-Table Integrity ───────────────────────────────────────────

describe("schema cross-table integrity", () => {
  test("all tables have an id primary key", () => {
    const tables = [
      users, credentials, sessions, plans, subscriptions,
      payments, tenantProjects, apiKeys, userWebhooks,
      auditLogs, notifications, supportTickets, supportMessages,
      analyticsEvents,
    ];
    for (const table of tables) {
      const columns = getTableColumns(table);
      expect(columns.id).toBeDefined();
      expect(columns.id.primary).toBe(true);
    }
  });

  test("all tables with userId have it as non-nullable (except supportTickets and analyticsEvents)", () => {
    const tablesWithRequiredUserId = [
      credentials, sessions, subscriptions, payments,
      tenantProjects, apiKeys, userWebhooks, notifications,
    ];
    for (const table of tablesWithRequiredUserId) {
      const columns = getTableColumns(table);
      expect(columns.userId.notNull).toBe(true);
    }
  });
});
