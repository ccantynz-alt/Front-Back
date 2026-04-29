import { beforeEach, describe, expect, it } from "bun:test";

import { AuditLogger } from "../src/audit";
import { parseMasterKey } from "../src/crypto";
import {
  type BranchRequest,
  type DbProvisioner,
  type DeprovisionRequest,
  type ProvisionRequest,
  type RestoreRequest,
  type RotateRequest,
  type SnapshotRequest,
} from "../src/provisioners";
import { DatabaseRegistry } from "../src/registry";
import { createServer } from "../src/server";
import type { AuditEntry, DbType } from "../src/types";

const HEX = "2".repeat(64);
const TOKEN = "test-managed-dbs-token";

class StubPostgres implements DbProvisioner {
  readonly type: DbType = "postgres";
  readonly supportsBranching = true;
  async provision(req: ProvisionRequest) {
    return {
      connectionString: `postgres://app:p@h/${req.dbId}`,
      externalRefs: { project_id: `proj_${req.dbId}`, role: "app", database: "main" },
    };
  }
  async branch(req: BranchRequest) {
    return {
      connectionString: `postgres://app:bp@h/${req.branchId}`,
      externalRefs: { branch_id: `b_${req.branchId}`, host: "h" },
    };
  }
  async snapshot(req: SnapshotRequest) {
    return { sizeBytes: 100, externalRefs: { neon_snapshot_id: req.snapshotId } };
  }
  async restore(_req: RestoreRequest) {
    return { connectionString: "postgres://app:r@h/main", externalRefs: {} };
  }
  async rotate(_req: RotateRequest) {
    return { connectionString: "postgres://app:rot@h/main", externalRefs: {} };
  }
  async deprovision(_req: DeprovisionRequest) {
    /* noop */
  }
}

class StubRedis implements DbProvisioner {
  readonly type: DbType = "redis";
  readonly supportsBranching = false;
  async provision(req: ProvisionRequest) {
    return {
      connectionString: `redis://u-${req.dbId}:p@h:6379/0`,
      externalRefs: { user: `u-${req.dbId}`, db_index: "0" },
    };
  }
  async branch(_req: BranchRequest): Promise<never> {
    throw new Error("unsupported");
  }
  async snapshot(_req: SnapshotRequest) {
    return { sizeBytes: 50, externalRefs: {} };
  }
  async restore() {
    return { connectionString: "redis://u:n@h:6379/0", externalRefs: {} };
  }
  async rotate() {
    return { connectionString: "redis://u:r@h:6379/0", externalRefs: {} };
  }
  async deprovision() {
    /* noop */
  }
}

interface AppRig {
  app: ReturnType<typeof createServer>;
  registry: DatabaseRegistry;
  entries: AuditEntry[];
}

function makeApp(): AppRig {
  const entries: AuditEntry[] = [];
  const audit = new AuditLogger({ sink: (e) => entries.push(e) });
  const provisioners = new Map<DbType, DbProvisioner>([
    ["postgres", new StubPostgres()],
    ["redis", new StubRedis()],
  ]);
  const registry = new DatabaseRegistry({
    masterKey: parseMasterKey(HEX),
    provisioners,
    audit,
  });
  const app = createServer({ registry, authToken: TOKEN, audit });
  return { app, registry, entries };
}

const auth = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  "x-crontech-requester": "deploy-orchestrator",
};

async function provisionPg(rig: AppRig, tenantId = "t1", name = "App"): Promise<string> {
  const res = await rig.app.request("/databases", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      tenantId,
      type: "postgres",
      name,
      region: "us-east-1",
      sizeTier: "starter",
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { dbId: string };
  return body.dbId;
}

describe("HTTP server — auth", () => {
  let rig: AppRig;
  beforeEach(() => {
    rig = makeApp();
  });

  it("rejects requests without bearer token", async () => {
    const res = await rig.app.request("/databases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer token", async () => {
    const res = await rig.app.request("/databases/anything?tenantId=t1", {
      method: "GET",
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("/health is open", async () => {
    const res = await rig.app.request("/health", { method: "GET" });
    expect(res.status).toBe(200);
  });
});

describe("HTTP server — provision + state", () => {
  let rig: AppRig;
  beforeEach(() => {
    rig = makeApp();
  });

  it("POST /databases creates a db without leaking the connection string", async () => {
    const res = await rig.app.request("/databases", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        tenantId: "t1",
        type: "postgres",
        name: "App",
        region: "us-east-1",
        sizeTier: "starter",
      }),
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain("postgres://");
  });

  it("GET /databases/:id returns metadata", async () => {
    const dbId = await provisionPg(rig);
    const res = await rig.app.request(`/databases/${dbId}?tenantId=t1`, {
      method: "GET",
      headers: auth,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ready");
  });

  it("GET /databases/:id 403s for wrong tenant", async () => {
    const dbId = await provisionPg(rig);
    const res = await rig.app.request(`/databases/${dbId}?tenantId=t2`, {
      method: "GET",
      headers: auth,
    });
    expect(res.status).toBe(403);
  });

  it("POST /databases/:id/connection-string returns plaintext + audits", async () => {
    const dbId = await provisionPg(rig);
    const res = await rig.app.request(`/databases/${dbId}/connection-string`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connectionString: string };
    expect(body.connectionString).toContain("postgres://");

    const log = rig.entries.find(
      (e) => e.action === "GET_CONNECTION_STRING" && e.requesterId === "deploy-orchestrator",
    );
    expect(log).toBeDefined();
  });
});

describe("HTTP server — branches + snapshots", () => {
  let rig: AppRig;
  beforeEach(() => {
    rig = makeApp();
  });

  it("POST /databases/:id/branches creates a postgres branch", async () => {
    const dbId = await provisionPg(rig);
    const res = await rig.app.request(`/databases/${dbId}/branches`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1", name: "feature-x" }),
    });
    expect(res.status).toBe(201);
  });

  it("POST /databases/:id/branches 422s for redis", async () => {
    const provision = await rig.app.request("/databases", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        tenantId: "t1",
        type: "redis",
        name: "cache",
        region: "us-east-1",
        sizeTier: "starter",
      }),
    });
    const { dbId } = (await provision.json()) as { dbId: string };
    const res = await rig.app.request(`/databases/${dbId}/branches`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1", name: "no" }),
    });
    expect(res.status).toBe(422);
  });

  it("snapshot create + list + restore round-trip", async () => {
    const dbId = await provisionPg(rig);
    const snapRes = await rig.app.request(`/databases/${dbId}/snapshots`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(snapRes.status).toBe(201);
    const snap = (await snapRes.json()) as { snapshotId: string };

    const listRes = await rig.app.request(
      `/databases/${dbId}/snapshots?tenantId=t1`,
      { method: "GET", headers: auth },
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { snapshots: unknown[] };
    expect(list.snapshots.length).toBe(1);

    const restoreRes = await rig.app.request(`/snapshots/${snap.snapshotId}/restore`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(restoreRes.status).toBe(200);
  });
});

describe("HTTP server — rotation", () => {
  let rig: AppRig;
  beforeEach(() => {
    rig = makeApp();
  });

  it("rotates credentials and the new string differs", async () => {
    const dbId = await provisionPg(rig);
    const before = await rig.app.request(`/databases/${dbId}/connection-string`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    const beforeBody = (await before.json()) as { connectionString: string };

    const rot = await rig.app.request(`/databases/${dbId}/rotate-credentials`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(rot.status).toBe(200);

    const after = await rig.app.request(`/databases/${dbId}/connection-string`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    const afterBody = (await after.json()) as {
      connectionString: string;
      previousConnectionString?: string;
    };
    expect(afterBody.connectionString).not.toBe(beforeBody.connectionString);
    expect(afterBody.previousConnectionString).toBe(beforeBody.connectionString);
  });
});

describe("HTTP server — soft delete + recover", () => {
  let rig: AppRig;
  beforeEach(() => {
    rig = makeApp();
  });

  it("soft-deletes then recovers", async () => {
    const dbId = await provisionPg(rig);
    const del = await rig.app.request(`/databases/${dbId}`, {
      method: "DELETE",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as { status: string };
    expect(delBody.status).toBe("soft_deleted");

    const rec = await rig.app.request(`/databases/${dbId}/recover`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(rec.status).toBe(200);
    const recBody = (await rec.json()) as { status: string };
    expect(recBody.status).toBe("ready");
  });

  it("connection-string is 404 for soft-deleted db", async () => {
    const dbId = await provisionPg(rig);
    await rig.app.request(`/databases/${dbId}`, {
      method: "DELETE",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    const res = await rig.app.request(`/databases/${dbId}/connection-string`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tenantId: "t1" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("HTTP server — quota", () => {
  it("returns 429 when quota exceeded", async () => {
    const entries: AuditEntry[] = [];
    const audit = new AuditLogger({ sink: (e) => entries.push(e) });
    const provisioners = new Map<DbType, DbProvisioner>([["postgres", new StubPostgres()]]);
    const registry = new DatabaseRegistry({
      masterKey: parseMasterKey(HEX),
      provisioners,
      audit,
      quotaPerTenant: 1,
    });
    const app = createServer({ registry, authToken: TOKEN, audit });

    const ok = await app.request("/databases", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        tenantId: "t1",
        type: "postgres",
        name: "a",
        region: "us-east-1",
        sizeTier: "starter",
      }),
    });
    expect(ok.status).toBe(201);

    const blocked = await app.request("/databases", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        tenantId: "t1",
        type: "postgres",
        name: "b",
        region: "us-east-1",
        sizeTier: "starter",
      }),
    });
    expect(blocked.status).toBe(429);
  });
});

describe("HTTP server — input validation", () => {
  let rig: AppRig;
  beforeEach(() => {
    rig = makeApp();
  });

  it("rejects malformed JSON", async () => {
    const res = await rig.app.request("/databases", {
      method: "POST",
      headers: auth,
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects bad region", async () => {
    const res = await rig.app.request("/databases", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        tenantId: "t1",
        type: "postgres",
        name: "x",
        region: "mars-1",
        sizeTier: "starter",
      }),
    });
    expect(res.status).toBe(400);
  });
});
