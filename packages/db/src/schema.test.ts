import { describe, test, expect } from "bun:test";
import { users, auditLogs } from "./schema";
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

  test("has exactly 7 columns", () => {
    const columns = getTableColumns(users);
    expect(Object.keys(columns).length).toBe(7);
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
    const columns = getTableColumns(auditLogs) as Record<string, { notNull: boolean }>;
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
      expect(columns[field]?.notNull).toBe(true);
    }
  });

  test("optional fields are nullable", () => {
    const columns = getTableColumns(auditLogs) as Record<string, { notNull: boolean }>;
    const optionalFields = [
      "actorIp",
      "actorDevice",
      "detail",
      "sessionId",
      "previousHash",
      "signature",
    ];
    for (const field of optionalFields) {
      expect(columns[field]?.notNull).toBe(false);
    }
  });

  test("has exactly 14 columns", () => {
    const columns = getTableColumns(auditLogs);
    expect(Object.keys(columns).length).toBe(14);
  });
});
