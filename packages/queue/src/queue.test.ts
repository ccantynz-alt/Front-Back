/**
 * Unit tests for @back-to-the-future/queue.
 *
 * Tests job schema validation, enqueue functions (mock BullMQ),
 * processor registry, and dispatch logic.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  SendEmailJobSchema,
  ProcessWebhookJobSchema,
  ProvisionTenantJobSchema,
  GenerateSiteJobSchema,
  JobTypeSchema,
  JOB_SCHEMAS,
} from "./jobs";
import {
  registerProcessor,
  getProcessor,
  hasProcessor,
  registeredTypes,
  clearProcessors,
  dispatch,
} from "./processors";
import type { Job } from "bullmq";

// ── Job schema validation ─────────────────────────────────────────────

describe("SendEmailJobSchema", () => {
  test("accepts valid email job", () => {
    const result = SendEmailJobSchema.safeParse({
      to: "alice@example.com",
      subject: "Hello",
      body: "World",
    });
    expect(result.success).toBe(true);
  });

  test("accepts email job with optional templateId", () => {
    const result = SendEmailJobSchema.safeParse({
      to: "alice@example.com",
      subject: "Hello",
      body: "World",
      templateId: "tmpl_123",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid email address", () => {
    const result = SendEmailJobSchema.safeParse({
      to: "not-an-email",
      subject: "Hello",
      body: "World",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing subject", () => {
    const result = SendEmailJobSchema.safeParse({
      to: "alice@example.com",
      body: "World",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty body", () => {
    const result = SendEmailJobSchema.safeParse({
      to: "alice@example.com",
      subject: "Hello",
      body: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ProcessWebhookJobSchema", () => {
  test("accepts valid webhook job", () => {
    const result = ProcessWebhookJobSchema.safeParse({
      webhookId: "wh_123",
      eventType: "user.created",
      payload: { userId: "u1" },
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing eventType", () => {
    const result = ProcessWebhookJobSchema.safeParse({
      webhookId: "wh_123",
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("ProvisionTenantJobSchema", () => {
  test("accepts valid tenant provision job", () => {
    const result = ProvisionTenantJobSchema.safeParse({
      tenantId: "t_123",
      plan: "pro",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid plan", () => {
    const result = ProvisionTenantJobSchema.safeParse({
      tenantId: "t_123",
      plan: "ultra",
    });
    expect(result.success).toBe(false);
  });

  test("accepts all valid plan values", () => {
    for (const plan of ["free", "pro", "enterprise"] as const) {
      const result = ProvisionTenantJobSchema.safeParse({
        tenantId: "t_123",
        plan,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("GenerateSiteJobSchema", () => {
  test("accepts valid site generation job", () => {
    const result = GenerateSiteJobSchema.safeParse({
      siteId: "s_123",
      tenantId: "t_456",
      prompt: "Build a landing page for my SaaS",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty prompt", () => {
    const result = GenerateSiteJobSchema.safeParse({
      siteId: "s_123",
      tenantId: "t_456",
      prompt: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("JobTypeSchema", () => {
  test("accepts all known job types", () => {
    const types = ["send_email", "process_webhook", "provision_tenant", "generate_site"] as const;
    for (const t of types) {
      expect(JobTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  test("rejects unknown job types", () => {
    expect(JobTypeSchema.safeParse("unknown_job").success).toBe(false);
    expect(JobTypeSchema.safeParse("").success).toBe(false);
    expect(JobTypeSchema.safeParse(42).success).toBe(false);
  });

  test("has 4 job types", () => {
    expect(JobTypeSchema.options).toHaveLength(4);
  });

  test("JOB_SCHEMAS has an entry for every job type", () => {
    for (const t of JobTypeSchema.options) {
      expect(JOB_SCHEMAS[t]).toBeDefined();
    }
  });
});

// ── Processor registry tests ──────────────────────────────────────────

describe("processor registry", () => {
  beforeEach(() => {
    clearProcessors();
  });

  test("registers and retrieves a processor", () => {
    const handler = mock(async () => {});
    registerProcessor("send_email", handler);
    expect(hasProcessor("send_email")).toBe(true);
    expect(getProcessor("send_email")).toBe(handler);
  });

  test("returns undefined for unregistered type", () => {
    expect(getProcessor("send_email")).toBeUndefined();
    expect(hasProcessor("send_email")).toBe(false);
  });

  test("lists registered types", () => {
    registerProcessor("send_email", async () => {});
    registerProcessor("process_webhook", async () => {});
    const types = registeredTypes();
    expect(types).toContain("send_email");
    expect(types).toContain("process_webhook");
    expect(types).toHaveLength(2);
  });

  test("clearProcessors removes all processors", () => {
    registerProcessor("send_email", async () => {});
    registerProcessor("process_webhook", async () => {});
    clearProcessors();
    expect(registeredTypes()).toHaveLength(0);
  });
});

// ── Dispatch (integration) tests ──────────────────────────────────────

describe("dispatch", () => {
  beforeEach(() => {
    clearProcessors();
  });

  test("dispatches to registered processor", async () => {
    const handler = mock(async () => {});
    registerProcessor("send_email", handler);

    const fakeJob = {
      name: "send_email",
      data: {
        to: "alice@example.com",
        subject: "Test",
        body: "Hello",
      },
      id: "job-1",
      opts: {},
      attemptsMade: 0,
    } as unknown as Job;

    await dispatch(fakeJob);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("throws when no processor registered", async () => {
    const fakeJob = {
      name: "send_email",
      data: { to: "a@b.com", subject: "x", body: "y" },
      id: "job-2",
      opts: {},
    } as unknown as Job;

    await expect(dispatch(fakeJob)).rejects.toThrow(
      "No processor registered for job type",
    );
  });

  test("validates payload against schema before dispatching", async () => {
    registerProcessor("send_email", async () => {});

    const fakeJob = {
      name: "send_email",
      data: {
        to: "not-an-email",
        subject: "Test",
        body: "Hello",
      },
      id: "job-3",
      opts: {},
    } as unknown as Job;

    await expect(dispatch(fakeJob)).rejects.toThrow();
  });

  test("passes data and job to processor", async () => {
    const handler = mock(async (_data: Record<string, unknown>, _job: Job) => {});
    registerProcessor("process_webhook", handler);

    const fakeJob = {
      name: "process_webhook",
      data: {
        webhookId: "wh_1",
        eventType: "user.created",
        payload: { key: "val" },
      },
      id: "job-4",
      opts: {},
    } as unknown as Job;

    await dispatch(fakeJob);
    expect(handler).toHaveBeenCalledTimes(1);
    const callArgs = handler.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect((callArgs![0] as Record<string, unknown>)["webhookId"]).toBe("wh_1");
  });
});
