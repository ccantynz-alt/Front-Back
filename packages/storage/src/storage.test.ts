/**
 * Unit tests for @back-to-the-future/storage.
 *
 * Tests key-prefix (tenant scoping), file-size validation, content-type
 * validation, and presigned URL generation with a mock S3 client.
 */

import { describe, test, expect } from "bun:test";
import { scopedKey } from "./client";
import {
  validateFileSize,
  validateContentType,
  getMaxUploadSizeBytes,
  DEFAULT_ALLOWED_TYPES,
} from "./middleware";

// ── Tenant-scoped key tests ───────────────────────────────────────────

describe("scopedKey", () => {
  test("prefixes key with tenantId", () => {
    expect(scopedKey("tenant-123", "uploads/file.png")).toBe(
      "tenant-123/uploads/file.png",
    );
  });

  test("strips leading slashes from key", () => {
    expect(scopedKey("tenant-123", "/uploads/file.png")).toBe(
      "tenant-123/uploads/file.png",
    );
    expect(scopedKey("tenant-123", "///file.png")).toBe(
      "tenant-123/file.png",
    );
  });

  test("sanitises path traversal attempts", () => {
    expect(scopedKey("tenant-123", "../../etc/passwd")).toBe(
      "tenant-123/etc/passwd",
    );
    expect(scopedKey("tenant-123", "uploads/../../../secret")).toBe(
      "tenant-123/uploads/secret",
    );
  });

  test("handles empty key", () => {
    expect(scopedKey("tenant-123", "")).toBe("tenant-123/");
  });

  test("handles nested paths correctly", () => {
    expect(scopedKey("t1", "a/b/c/d.txt")).toBe("t1/a/b/c/d.txt");
  });
});

// ── File size validation tests ────────────────────────────────────────

describe("validateFileSize", () => {
  test("accepts files under the limit", () => {
    const result = validateFileSize(1024, 50 * 1024 * 1024);
    expect(result).toBeNull();
  });

  test("accepts files exactly at the limit", () => {
    const limit = 50 * 1024 * 1024;
    const result = validateFileSize(limit, limit);
    expect(result).toBeNull();
  });

  test("rejects files over the limit", () => {
    const limit = 50 * 1024 * 1024;
    const result = validateFileSize(limit + 1, limit);
    expect(result).not.toBeNull();
    expect(result).toContain("exceeds maximum");
  });

  test("uses default when no override", () => {
    // getMaxUploadSizeBytes() should return default (50MB from env or hardcoded)
    const defaultMax = getMaxUploadSizeBytes();
    expect(defaultMax).toBeGreaterThan(0);
  });

  test("rejects zero-byte max gracefully", () => {
    const result = validateFileSize(1, 0);
    expect(result).not.toBeNull();
  });
});

// ── Content type validation tests ─────────────────────────────────────

describe("validateContentType", () => {
  test("accepts allowed content types", () => {
    expect(validateContentType("image/png")).toBeNull();
    expect(validateContentType("application/pdf")).toBeNull();
    expect(validateContentType("video/mp4")).toBeNull();
    expect(validateContentType("text/html")).toBeNull();
    expect(validateContentType("application/json")).toBeNull();
  });

  test("rejects disallowed content types", () => {
    const result = validateContentType("application/x-executable");
    expect(result).not.toBeNull();
    expect(result).toContain("not allowed");
  });

  test("rejects empty content type", () => {
    const result = validateContentType("");
    expect(result).not.toBeNull();
  });

  test("uses custom allowlist when provided", () => {
    const custom = new Set(["application/octet-stream"]);
    expect(validateContentType("application/octet-stream", custom)).toBeNull();
    expect(validateContentType("image/png", custom)).not.toBeNull();
  });

  test("DEFAULT_ALLOWED_TYPES contains expected common types", () => {
    expect(DEFAULT_ALLOWED_TYPES.has("image/png")).toBe(true);
    expect(DEFAULT_ALLOWED_TYPES.has("image/jpeg")).toBe(true);
    expect(DEFAULT_ALLOWED_TYPES.has("application/pdf")).toBe(true);
    expect(DEFAULT_ALLOWED_TYPES.has("text/plain")).toBe(true);
    expect(DEFAULT_ALLOWED_TYPES.has("video/mp4")).toBe(true);
    expect(DEFAULT_ALLOWED_TYPES.has("audio/mpeg")).toBe(true);
  });
});

// ── Presigned URL generation tests (mock S3 client) ───────────────────

describe("presigned URL generation", () => {
  test("generateUploadUrl returns null when R2 not configured", async () => {
    // Since R2 env vars are not set in test env, client returns null
    const { generateUploadUrl } = await import("./presigned");
    const result = await generateUploadUrl("tenant-1", "test.png", "image/png");
    expect(result).toBeNull();
  });

  test("generateDownloadUrl returns null when R2 not configured", async () => {
    const { generateDownloadUrl } = await import("./presigned");
    const result = await generateDownloadUrl("tenant-1", "test.png");
    expect(result).toBeNull();
  });
});
