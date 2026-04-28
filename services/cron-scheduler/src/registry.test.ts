import { describe, expect, test } from "bun:test";
import { JobRegistry } from "./registry";

describe("JobRegistry", () => {
  test("creates a job with parsed cron + defaults", () => {
    const reg = new JobRegistry();
    const job = reg.createJob({
      tenantId: "t",
      cronExpr: "@hourly",
      target: { type: "webhook", endpoint: "https://x" },
    });
    expect(job.tz).toBe("UTC");
    expect(job.retryPolicy.maxAttempts).toBe(3);
    expect(job.status).toBe("active");
    expect(job.parsed.minutes.has(0)).toBe(true);
  });

  test("rejects duplicate jobIds", () => {
    const reg = new JobRegistry();
    reg.createJob({
      jobId: "dup",
      tenantId: "t",
      cronExpr: "@hourly",
      target: { type: "webhook", endpoint: "https://x" },
    });
    expect(() =>
      reg.createJob({
        jobId: "dup",
        tenantId: "t",
        cronExpr: "@hourly",
        target: { type: "webhook", endpoint: "https://x" },
      }),
    ).toThrow();
  });

  test("rejects unknown timezones", () => {
    const reg = new JobRegistry();
    expect(() =>
      reg.createJob({
        tenantId: "t",
        cronExpr: "@hourly",
        tz: "Mars/Olympus_Mons",
        target: { type: "webhook", endpoint: "https://x" },
      }),
    ).toThrow();
  });

  test("filters listJobs by tenant and status", () => {
    const reg = new JobRegistry();
    reg.createJob({
      tenantId: "a",
      cronExpr: "@hourly",
      target: { type: "webhook", endpoint: "https://x" },
    });
    reg.createJob({
      tenantId: "b",
      cronExpr: "@hourly",
      target: { type: "webhook", endpoint: "https://x" },
      status: "paused",
    });
    expect(reg.listJobs({ tenantId: "a" })).toHaveLength(1);
    expect(reg.listJobs({ status: "paused" })).toHaveLength(1);
  });

  test("listRuns honors `since` filter", () => {
    const reg = new JobRegistry();
    const job = reg.createJob({
      tenantId: "t",
      cronExpr: "@hourly",
      target: { type: "webhook", endpoint: "https://x" },
    });
    reg.recordRun({
      runId: "r1",
      jobId: job.jobId,
      tenantId: "t",
      startedAt: 100,
      finishedAt: 110,
      status: "ok",
      attempt: 1,
      terminal: true,
    });
    reg.recordRun({
      runId: "r2",
      jobId: job.jobId,
      tenantId: "t",
      startedAt: 200,
      finishedAt: 210,
      status: "ok",
      attempt: 1,
      terminal: true,
    });
    expect(reg.listRuns(job.jobId)).toHaveLength(2);
    expect(reg.listRuns(job.jobId, 150)).toHaveLength(1);
  });
});
