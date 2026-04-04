import { describe, test, expect } from "bun:test";
import { createNeonClient } from "./neon";

describe("Neon Client", () => {
  test("createNeonClient throws without URL", () => {
    // Ensure env var is not set for this test
    const original = process.env["NEON_DATABASE_URL"];
    delete process.env["NEON_DATABASE_URL"];
    expect(() => createNeonClient()).toThrow("NEON_DATABASE_URL is required");
    if (original) process.env["NEON_DATABASE_URL"] = original;
  });

  test("createNeonClient accepts explicit URL", () => {
    const { db, sql } = createNeonClient("postgresql://user:pass@host/db");
    expect(db).toBeDefined();
    expect(sql).toBeDefined();
  });
});
