import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { withAudit } from "./audit";
import { db, auditLogs } from "@back-to-the-future/db";
import { desc } from "drizzle-orm";
import type { AuthEnv } from "../auth/middleware";

// Build a minimal test app with the audit middleware
function createTestApp() {
  const app = new Hono<AuthEnv>();

  // Simulate auth middleware that sets userId
  app.use("*", async (c, next) => {
    c.set("userId", "test-user-audit");
    await next();
  });

  app.get("/test/read", withAudit("test.read"), (c) => c.json({ ok: true }));
  app.post("/test/create", withAudit("test.create"), (c) => c.json({ ok: true }));
  app.delete("/test/delete", withAudit("test.delete"), (c) => c.json({ ok: true }));
  app.get("/test/fail", withAudit("test.fail"), (c) => c.json({ error: "bad" }, 500));

  return app;
}

describe("Audit Middleware (Hono)", () => {
  const app = createTestApp();

  test("withAudit logs successful GET request", async () => {
    const req = new Request("http://localhost/test/read");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    // Give the async audit write a moment to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(5);

    const auditEntry = logs.find(
      (l) => l.resourceType === "test.read" && l.actorId === "test-user-audit",
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.result).toBe("success");
    expect(auditEntry!.action).toBe("READ");
  });

  test("withAudit logs POST as CREATE action", async () => {
    const req = new Request("http://localhost/test/create", { method: "POST" });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(5);

    const auditEntry = logs.find(
      (l) =>
        l.resourceType === "test.create" && l.actorId === "test-user-audit",
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.action).toBe("CREATE");
  });

  test("withAudit logs DELETE as DELETE action", async () => {
    const req = new Request("http://localhost/test/delete", {
      method: "DELETE",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(5);

    const auditEntry = logs.find(
      (l) =>
        l.resourceType === "test.delete" && l.actorId === "test-user-audit",
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.action).toBe("DELETE");
  });

  test("withAudit logs failure result for 5xx responses", async () => {
    const req = new Request("http://localhost/test/fail");
    const res = await app.fetch(req);
    expect(res.status).toBe(500);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(5);

    const auditEntry = logs.find(
      (l) =>
        l.resourceType === "test.fail" && l.actorId === "test-user-audit",
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.result).toBe("failure");
  });

  test("withAudit includes timing data in detail", async () => {
    const req = new Request("http://localhost/test/read");
    await app.fetch(req);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(5);

    const auditEntry = logs.find(
      (l) =>
        l.resourceType === "test.read" && l.actorId === "test-user-audit",
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.detail).toBeDefined();

    const detail = JSON.parse(auditEntry!.detail!) as {
      method: string;
      status: number;
      durationMs: number;
    };
    expect(detail.method).toBe("GET");
    expect(detail.status).toBe(200);
    expect(typeof detail.durationMs).toBe("number");
  });
});
