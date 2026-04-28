// ── Persistent Disks — HTTP Control Plane ─────────────────────────────
// Hono server exposing the volume + snapshot lifecycle. Bound on
// localhost by default — this is internal infrastructure, never the
// public internet. Auth is a single shared bearer token
// (`DISKS_CONTROL_TOKEN`) since the only callers are other Crontech
// services. Tenant identity rides on the request payload.
//
// Conventions:
//   - All input is Zod-validated. Any parse failure → 400.
//   - Domain errors throw `DisksError` and are mapped to their status.
//   - Successful responses always include the latest registry view of
//     the resource so callers don't need a second round-trip.

import { Hono, type Context } from "hono";
import { z } from "zod";

import type { DiskDriver } from "./driver";
import { DiskRegistry, type RegistryOptions } from "./registry";
import { DisksError, type RestoreInput, type Snapshot, type Volume } from "./types";

export interface BuildAppOptions {
  driver: DiskDriver;
  /** Bearer token for the control plane (required). */
  authToken: string;
  /** Override the default 100 GiB quota. */
  defaultQuotaBytes?: number;
  /** Test injection. */
  registryOptions?: Omit<RegistryOptions, "driver" | "defaultQuotaBytes">;
}

export interface BuiltApp {
  app: Hono;
  registry: DiskRegistry;
}

const fsSchema = z.enum(["ext4", "nfs"]);

const createSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  fs: fsSchema,
});

const attachSchema = z.object({
  workerId: z.string().min(1),
  mountPath: z.string().startsWith("/"),
});

const resizeSchema = z.object({
  newSizeBytes: z.number().int().positive(),
});

const snapshotCreateSchema = z
  .object({
    ttlMs: z.number().int().positive().optional(),
  })
  .optional();

const restoreSchema = z.object({
  targetVolumeId: z.string().min(1).optional(),
  newVolumeName: z.string().min(1).max(100).optional(),
});

export function buildApp(options: BuildAppOptions): BuiltApp {
  if (!options.authToken) {
    throw new Error("buildApp requires authToken (DISKS_CONTROL_TOKEN)");
  }
  const registryOpts = options.registryOptions ?? {};
  const registry = new DiskRegistry({
    driver: options.driver,
    ...(options.defaultQuotaBytes !== undefined
      ? { defaultQuotaBytes: options.defaultQuotaBytes }
      : {}),
    ...registryOpts,
  });

  const app = new Hono();

  // ── Auth middleware (skip for /health) ──────────────────────────────
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    const header = c.req.header("authorization") ?? "";
    const expected = `Bearer ${options.authToken}`;
    if (header !== expected) {
      return c.json({ error: "unauthorized", code: "auth_required" }, 401);
    }
    await next();
  });

  app.get("/health", (c) =>
    c.json({ status: "ok", service: "persistent-disks", driver: options.driver.name }),
  );

  // ── Volumes ────────────────────────────────────────────────────────

  app.post("/volumes", (c) =>
    handle(c, async () => {
      const body = await readJson(c);
      const parsed = createSchema.parse(body);
      const v = await registry.createVolume(parsed);
      return jsonRes(v, 201);
    }),
  );

  app.get("/volumes/:id", (c) =>
    handle(c, () => jsonRes(registry.getVolume(c.req.param("id")))),
  );

  app.get("/volumes", (c) =>
    handle(c, () => {
      const tenantId = c.req.query("tenantId");
      return jsonRes({
        volumes: registry.listVolumes(tenantId === undefined ? undefined : tenantId),
      });
    }),
  );

  app.post("/volumes/:id/attach", (c) =>
    handle(c, async () => {
      const body = await readJson(c);
      const parsed = attachSchema.parse(body);
      const v = await registry.attachVolume(c.req.param("id"), parsed);
      return jsonRes(v);
    }),
  );

  app.post("/volumes/:id/detach", (c) =>
    handle(c, async () => jsonRes(await registry.detachVolume(c.req.param("id")))),
  );

  app.post("/volumes/:id/resize", (c) =>
    handle(c, async () => {
      const body = await readJson(c);
      const parsed = resizeSchema.parse(body);
      const v = await registry.resizeVolume(c.req.param("id"), parsed.newSizeBytes);
      return jsonRes(v);
    }),
  );

  app.delete("/volumes/:id", (c) =>
    handle(c, async () => {
      const id = c.req.param("id");
      await registry.deleteVolume(id);
      return jsonRes({ status: "deleted", volumeId: id });
    }),
  );

  // ── Snapshots ──────────────────────────────────────────────────────

  app.post("/volumes/:id/snapshots", (c) =>
    handle(c, async () => {
      const body = (await readJsonOrEmpty(c)) ?? {};
      const parsed = snapshotCreateSchema.parse(body) ?? {};
      const opts = parsed.ttlMs !== undefined ? { ttlMs: parsed.ttlMs } : undefined;
      const s = await registry.createSnapshot(c.req.param("id"), opts);
      return snapshotRes(s, 201);
    }),
  );

  app.get("/snapshots/:id", (c) =>
    handle(c, () => snapshotRes(registry.getSnapshot(c.req.param("id")))),
  );

  app.get("/snapshots", (c) =>
    handle(c, () => {
      const volumeId = c.req.query("volumeId");
      return jsonRes({
        snapshots: registry.listSnapshots(volumeId === undefined ? undefined : volumeId),
      });
    }),
  );

  app.post("/snapshots/:id/restore", (c) =>
    handle(c, async () => {
      const body = (await readJsonOrEmpty(c)) ?? {};
      const parsed = restoreSchema.parse(body);
      // Build a RestoreInput that respects exactOptionalPropertyTypes —
      // only include keys whose value is not undefined.
      const input: RestoreInput = {};
      if (parsed.targetVolumeId !== undefined) input.targetVolumeId = parsed.targetVolumeId;
      if (parsed.newVolumeName !== undefined) input.newVolumeName = parsed.newVolumeName;
      const v = await registry.restoreSnapshot(c.req.param("id"), input);
      return jsonRes(v);
    }),
  );

  return { app, registry };
}

// ── Response helpers ────────────────────────────────────────────────

function jsonRes(body: Volume | { volumes: readonly Volume[] } | { status: string; volumeId: string } | { snapshots: readonly Snapshot[] }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function snapshotRes(s: Snapshot, status = 200): Response {
  return new Response(JSON.stringify(s), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ── Request helpers ─────────────────────────────────────────────────

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new DisksError(400, "json_invalid", "request body must be valid JSON");
  }
}

async function readJsonOrEmpty(c: {
  req: { json: () => Promise<unknown> };
}): Promise<unknown | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

// ── Error mapping ───────────────────────────────────────────────────
// We avoid `c.json(_, status)` because Hono types its status arg as a
// finite literal union — instead we hand-build a Response so dynamic
// numeric statuses (e.g. derived from DisksError) remain type-safe.

async function handle(
  _c: Context,
  fn: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DisksError) {
      return errorResponse(err.status, { error: err.message, code: err.code });
    }
    if (err instanceof z.ZodError) {
      return errorResponse(400, {
        error: "validation_failed",
        code: "validation_failed",
        issues: err.issues,
      });
    }
    const message = err instanceof Error ? err.message : "internal_error";
    return errorResponse(500, { error: message, code: "internal_error" });
  }
}

function errorResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
