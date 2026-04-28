// ── Managed Databases HTTP Server ─────────────────────────────────────
// Internal-only HTTP API. Bearer-token authenticated. Connection strings
// are NEVER returned by GET /databases/:id — only by an explicit
// `POST /databases/:id/connection-string` call which is audited.

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { AuditLogger } from "./audit";
import { constantTimeEqual } from "./crypto";
import {
  DatabaseRegistry,
  NotFoundError,
  QuotaExceededError,
  TenantMismatchError,
  UnsupportedOperationError,
} from "./registry";

export interface ServerOptions {
  readonly registry: DatabaseRegistry;
  readonly authToken: string;
  readonly audit?: AuditLogger;
}

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_\-:.]+$/);
const tenantIdSchema = idSchema;
const nameSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_\- ]+$/);

const dbTypeSchema = z.enum(["postgres", "redis"]);
const sizeTierSchema = z.enum(["starter", "standard", "pro"]);
const regionSchema = z.enum([
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "ap-southeast-1",
  "ap-northeast-1",
]);

const provisionBody = z.object({
  tenantId: tenantIdSchema,
  type: dbTypeSchema,
  name: nameSchema,
  region: regionSchema,
  sizeTier: sizeTierSchema,
});

const tenantBody = z.object({ tenantId: tenantIdSchema });
const branchBody = z.object({
  tenantId: tenantIdSchema,
  name: nameSchema,
  fromSnapshotId: idSchema.optional(),
});
const snapshotBody = z.object({
  tenantId: tenantIdSchema,
  retentionDays: z.number().int().min(1).max(365).optional(),
});

export function createServer(options: ServerOptions): Hono {
  const { registry, authToken } = options;
  const app = new Hono();

  // ── Auth middleware on /databases/* and /snapshots/* ─────────────
  const authGuard = async (c: Context, next: () => Promise<void>) => {
    const header = c.req.header("authorization") ?? "";
    const expected = `Bearer ${authToken}`;
    if (!constantTimeEqual(header, expected)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
    return;
  };
  app.use("/databases", authGuard);
  app.use("/databases/*", authGuard);
  app.use("/snapshots/*", authGuard);

  function requesterId(c: Context): string {
    return c.req.header("x-crontech-requester") ?? "internal";
  }

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "managed-databases",
      timestamp: new Date().toISOString(),
    }),
  );

  // ── POST /databases ──────────────────────────────────────────────
  app.post("/databases", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = provisionBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body", details: parsed.error.issues }, 400);
    }
    try {
      const view = await registry.provision({
        ...parsed.data,
        requesterId: requesterId(c),
      });
      return c.json(view, 201);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── GET /databases/:id?tenantId=xxx ──────────────────────────────
  app.get("/databases/:id", (c) => {
    const dbId = c.req.param("id");
    const tenantId = c.req.query("tenantId") ?? "";
    if (!idSchema.safeParse(dbId).success || !tenantIdSchema.safeParse(tenantId).success) {
      return c.json({ error: "invalid id or tenantId" }, 400);
    }
    try {
      const view = registry.get(dbId, tenantId);
      return c.json(view, 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── POST /databases/:id/connection-string ────────────────────────
  // Returns the plaintext connection string. Audited.
  app.post("/databases/:id/connection-string", async (c) => {
    const dbId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = tenantBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const cs = registry.getConnectionString({
        dbId,
        tenantId: parsed.data.tenantId,
        requesterId: requesterId(c),
      });
      const previous = registry.getPreviousConnectionString({
        dbId,
        tenantId: parsed.data.tenantId,
      });
      return c.json(
        {
          dbId,
          connectionString: cs,
          ...(previous !== null ? { previousConnectionString: previous } : {}),
        },
        200,
      );
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── POST /databases/:id/snapshots ────────────────────────────────
  app.post("/databases/:id/snapshots", async (c) => {
    const dbId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = snapshotBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const snap = await registry.createSnapshot({
        dbId,
        tenantId: parsed.data.tenantId,
        trigger: "manual",
        ...(parsed.data.retentionDays !== undefined
          ? { retentionDays: parsed.data.retentionDays }
          : {}),
        requesterId: requesterId(c),
      });
      return c.json(snap, 201);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── GET /databases/:id/snapshots?tenantId=xxx ────────────────────
  app.get("/databases/:id/snapshots", (c) => {
    const dbId = c.req.param("id");
    const tenantId = c.req.query("tenantId") ?? "";
    if (!tenantIdSchema.safeParse(tenantId).success) {
      return c.json({ error: "invalid tenantId" }, 400);
    }
    try {
      const snaps = registry.listSnapshots(dbId, tenantId);
      return c.json({ dbId, snapshots: snaps }, 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── POST /snapshots/:id/restore ──────────────────────────────────
  app.post("/snapshots/:id/restore", async (c) => {
    const snapshotId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = tenantBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const view = await registry.restoreSnapshot({
        snapshotId,
        tenantId: parsed.data.tenantId,
        requesterId: requesterId(c),
      });
      return c.json(view, 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── POST /databases/:id/branches ─────────────────────────────────
  app.post("/databases/:id/branches", async (c) => {
    const dbId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = branchBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const branch = await registry.createBranch({
        dbId,
        tenantId: parsed.data.tenantId,
        name: parsed.data.name,
        ...(parsed.data.fromSnapshotId !== undefined
          ? { fromSnapshotId: parsed.data.fromSnapshotId }
          : {}),
        requesterId: requesterId(c),
      });
      return c.json(branch, 201);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── POST /databases/:id/rotate-credentials ───────────────────────
  app.post("/databases/:id/rotate-credentials", async (c) => {
    const dbId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = tenantBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const view = await registry.rotateCredentials({
        dbId,
        tenantId: parsed.data.tenantId,
        requesterId: requesterId(c),
      });
      return c.json(view, 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── DELETE /databases/:id  (soft delete) ─────────────────────────
  app.delete("/databases/:id", async (c) => {
    const dbId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = tenantBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const view = registry.softDelete({
        dbId,
        tenantId: parsed.data.tenantId,
        requesterId: requesterId(c),
      });
      return c.json(view, 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  // ── POST /databases/:id/recover ──────────────────────────────────
  app.post("/databases/:id/recover", async (c) => {
    const dbId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = tenantBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body" }, 400);
    }
    try {
      const view = registry.recover({
        dbId,
        tenantId: parsed.data.tenantId,
        requesterId: requesterId(c),
      });
      return c.json(view, 200);
    } catch (err) {
      return mapError(c, err);
    }
  });

  return app;
}

function mapError(c: Context, err: unknown): Response {
  if (err instanceof QuotaExceededError) {
    return c.json({ error: "quota_exceeded", message: err.message }, 429);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: "not_found", resource: err.resource }, 404);
  }
  if (err instanceof TenantMismatchError) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (err instanceof UnsupportedOperationError) {
    return c.json({ error: "unsupported", message: err.message }, 422);
  }
  const message = err instanceof Error ? err.message : "internal error";
  return c.json({ error: "internal", message }, 500);
}
