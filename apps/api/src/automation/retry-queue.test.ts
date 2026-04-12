// ── Retry queue schema tests ────────────────────────────────────────
// Locks the Zod schema for JobType so a new job kind can't sneak in
// via a raw string. If someone adds "foo_bar" to one call site and
// forgets to update the schema, the type guard catches it.

import { describe, test, expect } from "bun:test";
import { JobTypeSchema, isJobType, type JobType } from "./retry-queue";

describe("JobTypeSchema", () => {
  test("accepts every known job kind", () => {
    const all: JobType[] = [
      "provision_workspace",
      "send_email",
      "create_sample_content",
      "provision_db",
    ];
    for (const kind of all) {
      expect(JobTypeSchema.safeParse(kind).success).toBe(true);
      expect(isJobType(kind)).toBe(true);
    }
  });

  test("rejects unknown job kinds", () => {
    expect(isJobType("provision_cluster")).toBe(false);
    expect(isJobType("")).toBe(false);
    expect(isJobType(null)).toBe(false);
    expect(isJobType(42)).toBe(false);
    expect(isJobType({ type: "send_email" })).toBe(false);
  });

  test("enum options list is exhaustive", () => {
    // If someone adds a variant to the schema, this count will drift
    // and force the test to be updated — intentional tripwire.
    expect(JobTypeSchema.options).toHaveLength(4);
  });
});
