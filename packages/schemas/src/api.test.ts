import { describe, test, expect } from "bun:test";
import {
  UserSchema,
  CreateUserInput,
  PaginationInput,
  PaginatedResponse,
  EnvSchema,
} from "./api";
import { z } from "zod";

// ── UserSchema ────────────────────────────────────────────────────────

describe("UserSchema", () => {
  const validUser = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "user@example.com",
    displayName: "John Doe",
    role: "admin" as const,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };

  test("accepts a valid user", () => {
    const result = UserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  test("accepts all valid roles", () => {
    for (const role of ["admin", "editor", "viewer"] as const) {
      const result = UserSchema.safeParse({ ...validUser, role });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid UUID for id", () => {
    const result = UserSchema.safeParse({ ...validUser, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email", () => {
    const result = UserSchema.safeParse({ ...validUser, email: "not-email" });
    expect(result.success).toBe(false);
  });

  test("rejects empty email", () => {
    const result = UserSchema.safeParse({ ...validUser, email: "" });
    expect(result.success).toBe(false);
  });

  test("rejects empty displayName", () => {
    const result = UserSchema.safeParse({ ...validUser, displayName: "" });
    expect(result.success).toBe(false);
  });

  test("rejects displayName over 100 characters", () => {
    const result = UserSchema.safeParse({
      ...validUser,
      displayName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test("accepts displayName at exactly 100 characters", () => {
    const result = UserSchema.safeParse({
      ...validUser,
      displayName: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid role", () => {
    const result = UserSchema.safeParse({ ...validUser, role: "superadmin" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid datetime for createdAt", () => {
    const result = UserSchema.safeParse({
      ...validUser,
      createdAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing fields", () => {
    const result = UserSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── CreateUserInput ───────────────────────────────────────────────────

describe("CreateUserInput", () => {
  test("accepts valid input with all fields", () => {
    const result = CreateUserInput.safeParse({
      email: "user@example.com",
      displayName: "Jane",
      role: "editor",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("editor");
    }
  });

  test("defaults role to viewer when omitted", () => {
    const result = CreateUserInput.safeParse({
      email: "user@example.com",
      displayName: "Jane",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("viewer");
    }
  });

  test("rejects invalid email", () => {
    const result = CreateUserInput.safeParse({
      email: "bad",
      displayName: "Jane",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty displayName", () => {
    const result = CreateUserInput.safeParse({
      email: "user@example.com",
      displayName: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects displayName over 100 characters", () => {
    const result = CreateUserInput.safeParse({
      email: "user@example.com",
      displayName: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing email", () => {
    const result = CreateUserInput.safeParse({ displayName: "Jane" });
    expect(result.success).toBe(false);
  });
});

// ── PaginationInput ──────────────────────────────────────────────────

describe("PaginationInput", () => {
  test("accepts valid pagination with cursor and limit", () => {
    const result = PaginationInput.safeParse({ cursor: "abc123", limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBe("abc123");
      expect(result.data.limit).toBe(50);
    }
  });

  test("defaults limit to 20 when omitted", () => {
    const result = PaginationInput.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  test("cursor is optional", () => {
    const result = PaginationInput.safeParse({ limit: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cursor).toBeUndefined();
    }
  });

  test("rejects limit below 1", () => {
    const result = PaginationInput.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  test("rejects negative limit", () => {
    const result = PaginationInput.safeParse({ limit: -5 });
    expect(result.success).toBe(false);
  });

  test("rejects limit above 100", () => {
    const result = PaginationInput.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  test("accepts limit at boundaries (1 and 100)", () => {
    expect(PaginationInput.safeParse({ limit: 1 }).success).toBe(true);
    expect(PaginationInput.safeParse({ limit: 100 }).success).toBe(true);
  });

  test("rejects non-integer limit", () => {
    const result = PaginationInput.safeParse({ limit: 10.5 });
    expect(result.success).toBe(false);
  });
});

// ── PaginatedResponse ────────────────────────────────────────────────

describe("PaginatedResponse", () => {
  const StringPaginatedResponse = PaginatedResponse(z.string());

  test("accepts valid paginated response", () => {
    const result = StringPaginatedResponse.safeParse({
      items: ["a", "b", "c"],
      nextCursor: "cursor123",
      total: 100,
    });
    expect(result.success).toBe(true);
  });

  test("accepts null nextCursor", () => {
    const result = StringPaginatedResponse.safeParse({
      items: [],
      nextCursor: null,
      total: 0,
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing total", () => {
    const result = StringPaginatedResponse.safeParse({
      items: [],
      nextCursor: null,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-array items", () => {
    const result = StringPaginatedResponse.safeParse({
      items: "not-an-array",
      nextCursor: null,
      total: 0,
    });
    expect(result.success).toBe(false);
  });

  test("validates item types within items array", () => {
    const result = StringPaginatedResponse.safeParse({
      items: [1, 2, 3],
      nextCursor: null,
      total: 3,
    });
    expect(result.success).toBe(false);
  });
});

// ── EnvSchema ────────────────────────────────────────────────────────

describe("EnvSchema", () => {
  const validEnv = {
    DATABASE_URL: "https://db.example.com",
    DATABASE_AUTH_TOKEN: "token123",
  };

  test("accepts valid env with defaults", () => {
    const result = EnvSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.API_PORT).toBe(3001);
      expect(result.data.WEB_PORT).toBe(3000);
    }
  });

  test("accepts all valid NODE_ENV values", () => {
    for (const env of ["development", "production", "test"] as const) {
      const result = EnvSchema.safeParse({ ...validEnv, NODE_ENV: env });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid NODE_ENV", () => {
    const result = EnvSchema.safeParse({ ...validEnv, NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });

  test("rejects missing DATABASE_URL", () => {
    const result = EnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects non-URL DATABASE_URL", () => {
    const result = EnvSchema.safeParse({ DATABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  test("DATABASE_AUTH_TOKEN is optional", () => {
    const result = EnvSchema.safeParse({
      DATABASE_URL: "https://db.example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_AUTH_TOKEN).toBeUndefined();
    }
  });

  test("rejects empty string for DATABASE_AUTH_TOKEN", () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      DATABASE_AUTH_TOKEN: "",
    });
    expect(result.success).toBe(false);
  });

  test("coerces string port numbers to integers", () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      API_PORT: "8080",
      WEB_PORT: "9090",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.API_PORT).toBe(8080);
      expect(result.data.WEB_PORT).toBe(9090);
    }
  });
});
