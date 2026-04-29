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
import {
  DatabaseRegistry,
  NotFoundError,
  QuotaExceededError,
  TenantMismatchError,
  UnsupportedOperationError,
} from "../src/registry";
import type { AuditEntry, DbType } from "../src/types";

const HEX = "1".repeat(64);

class MockPostgres implements DbProvisioner {
  readonly type: DbType = "postgres";
  readonly supportsBranching = true;
  public provisionCalls: ProvisionRequest[] = [];
  public branchCalls: BranchRequest[] = [];
  public snapshotCalls: SnapshotRequest[] = [];
  public restoreCalls: RestoreRequest[] = [];
  public rotateCalls: RotateRequest[] = [];
  public deprovisionCalls: DeprovisionRequest[] = [];
  private rotateCounter = 0;

  async provision(req: ProvisionRequest) {
    this.provisionCalls.push(req);
    return {
      connectionString: `postgres://app:initial@host/main_${req.dbId}`,
      externalRefs: { project_id: `proj_${req.dbId}`, role: "app", database: "main" },
    };
  }
  async branch(req: BranchRequest) {
    this.branchCalls.push(req);
    return {
      connectionString: `postgres://app:branch@host/main_${req.branchId}`,
      externalRefs: { branch_id: `b_${req.branchId}`, host: "host" },
    };
  }
  async snapshot(req: SnapshotRequest) {
    this.snapshotCalls.push(req);
    return { sizeBytes: 12345, externalRefs: { neon_snapshot_id: `s_${req.snapshotId}` } };
  }
  async restore(req: RestoreRequest) {
    this.restoreCalls.push(req);
    return {
      connectionString: `postgres://app:restored@host/main`,
      externalRefs: { branch_id: "br_restore", host: "host" },
    };
  }
  async rotate(req: RotateRequest) {
    this.rotateCalls.push(req);
    this.rotateCounter += 1;
    return {
      connectionString: `postgres://app:rotated_${this.rotateCounter}@host/main`,
      externalRefs: { host: "host" },
    };
  }
  async deprovision(req: DeprovisionRequest) {
    this.deprovisionCalls.push(req);
  }
}

class MockRedis implements DbProvisioner {
  readonly type: DbType = "redis";
  readonly supportsBranching = false;
  async provision(req: ProvisionRequest) {
    return {
      connectionString: `redis://u-${req.dbId}:p@host:6379/0`,
      externalRefs: { user: `u-${req.dbId}`, db_index: "0" },
    };
  }
  async branch(_req: BranchRequest): Promise<never> {
    throw new Error("redis does not support branching");
  }
  async snapshot(req: SnapshotRequest) {
    return { sizeBytes: 999, externalRefs: { rdb_path: `/tmp/${req.snapshotId}` } };
  }
  async restore() {
    return { connectionString: "redis://u:newp@host:6379/0", externalRefs: {} };
  }
  async rotate() {
    return { connectionString: "redis://u:rotp@host:6379/0", externalRefs: {} };
  }
  async deprovision() {
    /* noop */
  }
}

interface TestRig {
  registry: DatabaseRegistry;
  audit: AuditLogger;
  entries: AuditEntry[];
  pg: MockPostgres;
  redis: MockRedis;
  now: { value: number };
  ids: string[];
  popId: () => string;
}

function makeRig(opts?: { quotaPerTenant?: number; rotationGraceMs?: number }): TestRig {
  const entries: AuditEntry[] = [];
  const audit = new AuditLogger({ sink: (e) => entries.push(e) });
  const pg = new MockPostgres();
  const redis = new MockRedis();
  const provisioners = new Map<DbType, DbProvisioner>([
    ["postgres", pg],
    ["redis", redis],
  ]);
  const now = { value: 1_000_000 };
  let counter = 0;
  const ids: string[] = [];
  const popId = () => {
    counter += 1;
    const id = `id-${counter}`;
    ids.push(id);
    return id;
  };
  const registry = new DatabaseRegistry({
    masterKey: parseMasterKey(HEX),
    provisioners,
    audit,
    clock: () => now.value,
    ...(opts?.quotaPerTenant !== undefined ? { quotaPerTenant: opts.quotaPerTenant } : {}),
    ...(opts?.rotationGraceMs !== undefined ? { rotationGraceMs: opts.rotationGraceMs } : {}),
    idGenerator: popId,
  });
  return { registry, audit, entries, pg, redis, now, ids, popId };
}

describe("DatabaseRegistry — provision + de-provision", () => {
  it("provisions a postgres db and stores connection string encrypted", async () => {
    const rig = makeRig();
    const view = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "App DB",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    expect(view.status).toBe("ready");
    expect(view.type).toBe("postgres");
    expect(rig.pg.provisionCalls.length).toBe(1);
    expect(rig.entries.some((e) => e.action === "PROVISION" && e.result === "ok")).toBe(true);
    // Public view never exposes the connection string.
    expect(JSON.stringify(view)).not.toContain("postgres://");
  });

  it("soft-deletes then permanently purges after recovery window", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "to delete",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    rig.registry.softDelete({ dbId: v.dbId, tenantId: "t1", requesterId: "alice" });
    // Within window — purge is a no-op.
    expect(await rig.registry.purgeIfExpired(v.dbId)).toBe(false);
    // Advance past 7 days.
    rig.now.value += 8 * 24 * 60 * 60 * 1000;
    expect(await rig.registry.purgeIfExpired(v.dbId)).toBe(true);
    expect(rig.pg.deprovisionCalls.length).toBe(1);
  });
});

describe("DatabaseRegistry — connection strings", () => {
  it("getConnectionString round-trips plaintext and audits the access", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    const cs = rig.registry.getConnectionString({
      dbId: v.dbId,
      tenantId: "t1",
      requesterId: "deploy-orchestrator",
    });
    expect(cs.startsWith("postgres://")).toBe(true);
    const accessLog = rig.entries.find(
      (e) => e.action === "GET_CONNECTION_STRING" && e.requesterId === "deploy-orchestrator",
    );
    expect(accessLog).toBeDefined();
    expect(accessLog?.dbId).toBe(v.dbId);
  });

  it("rejects access from another tenant", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    expect(() =>
      rig.registry.getConnectionString({
        dbId: v.dbId,
        tenantId: "t2",
        requesterId: "bob",
      }),
    ).toThrow(TenantMismatchError);
  });

  it("404s on unknown db", () => {
    const rig = makeRig();
    expect(() =>
      rig.registry.getConnectionString({
        dbId: "missing",
        tenantId: "t1",
        requesterId: "alice",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("DatabaseRegistry — rotation grace period", () => {
  it("keeps previous credentials valid until grace expires", async () => {
    const rig = makeRig({ rotationGraceMs: 60_000 });
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    const csBefore = rig.registry.getConnectionString({
      dbId: v.dbId,
      tenantId: "t1",
      requesterId: "alice",
    });
    await rig.registry.rotateCredentials({
      dbId: v.dbId,
      tenantId: "t1",
      requesterId: "alice",
    });
    const csAfter = rig.registry.getConnectionString({
      dbId: v.dbId,
      tenantId: "t1",
      requesterId: "alice",
    });
    expect(csAfter).not.toBe(csBefore);
    const previous = rig.registry.getPreviousConnectionString({
      dbId: v.dbId,
      tenantId: "t1",
    });
    expect(previous).toBe(csBefore);

    // Advance past grace period.
    rig.now.value += 61_000;
    const previousExpired = rig.registry.getPreviousConnectionString({
      dbId: v.dbId,
      tenantId: "t1",
    });
    expect(previousExpired).toBeNull();
  });
});

describe("DatabaseRegistry — branching", () => {
  it("creates a postgres branch", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    const branch = await rig.registry.createBranch({
      dbId: v.dbId,
      tenantId: "t1",
      name: "feature-x",
      requesterId: "alice",
    });
    expect(branch.name).toBe("feature-x");
    expect(branch.dbId).toBe(v.dbId);
    expect(rig.registry.listBranches(v.dbId, "t1").length).toBe(1);
    expect(rig.entries.some((e) => e.action === "BRANCH_CREATE" && e.result === "ok")).toBe(true);
  });

  it("rejects branching for redis (422 unsupported)", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "redis",
      name: "cache",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    let err: unknown;
    try {
      await rig.registry.createBranch({
        dbId: v.dbId,
        tenantId: "t1",
        name: "no",
        requesterId: "alice",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnsupportedOperationError);
    expect(rig.entries.some((e) => e.action === "BRANCH_CREATE" && e.result === "error")).toBe(true);
  });
});

describe("DatabaseRegistry — snapshots + restore", () => {
  it("creates a snapshot then restores from it", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    const snap = await rig.registry.createSnapshot({
      dbId: v.dbId,
      tenantId: "t1",
      trigger: "manual",
      requesterId: "alice",
    });
    expect(snap.sizeBytes).toBe(12345);
    expect(rig.registry.listSnapshots(v.dbId, "t1").length).toBe(1);

    const restored = await rig.registry.restoreSnapshot({
      snapshotId: snap.snapshotId,
      tenantId: "t1",
      requesterId: "alice",
    });
    expect(restored.dbId).toBe(v.dbId);
    expect(restored.status).toBe("ready");
    // Connection string post-restore must decrypt under tenant DEK.
    const cs = rig.registry.getConnectionString({
      dbId: v.dbId,
      tenantId: "t1",
      requesterId: "alice",
    });
    expect(cs).toContain("restored");
  });
});

describe("DatabaseRegistry — quota enforcement", () => {
  it("rejects provisioning beyond per-tenant quota", async () => {
    const rig = makeRig({ quotaPerTenant: 2 });
    await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "a",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "b",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    let err: unknown;
    try {
      await rig.registry.provision({
        tenantId: "t1",
        type: "postgres",
        name: "c",
        region: "us-east-1",
        sizeTier: "starter",
        requesterId: "alice",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(rig.entries.some((e) => e.action === "QUOTA_REJECT")).toBe(true);
  });

  it("does not count soft-deleted dbs against the quota", async () => {
    const rig = makeRig({ quotaPerTenant: 1 });
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "a",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    rig.registry.softDelete({ dbId: v.dbId, tenantId: "t1", requesterId: "alice" });
    // Quota of 1 with soft-deleted db does not block new provision.
    const v2 = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "b",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    expect(v2.dbId).not.toBe(v.dbId);
  });
});

describe("DatabaseRegistry — soft delete recovery window", () => {
  it("recovers a soft-deleted db within 7 days", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    rig.registry.softDelete({ dbId: v.dbId, tenantId: "t1", requesterId: "alice" });
    rig.now.value += 6 * 24 * 60 * 60 * 1000;
    const recovered = rig.registry.recover({
      dbId: v.dbId,
      tenantId: "t1",
      requesterId: "alice",
    });
    expect(recovered.status).toBe("ready");
    expect(recovered.softDeletedAt).toBeNull();
  });

  it("refuses to recover after window expires", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    rig.registry.softDelete({ dbId: v.dbId, tenantId: "t1", requesterId: "alice" });
    rig.now.value += 8 * 24 * 60 * 60 * 1000;
    expect(() =>
      rig.registry.recover({
        dbId: v.dbId,
        tenantId: "t1",
        requesterId: "alice",
      }),
    ).toThrow(UnsupportedOperationError);
  });

  it("getConnectionString refuses for soft-deleted db", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    rig.registry.softDelete({ dbId: v.dbId, tenantId: "t1", requesterId: "alice" });
    expect(() =>
      rig.registry.getConnectionString({
        dbId: v.dbId,
        tenantId: "t1",
        requesterId: "alice",
      }),
    ).toThrow(NotFoundError);
  });
});

describe("DatabaseRegistry — AI v2 hook", () => {
  it("returns a stub suggestion list", async () => {
    const rig = makeRig();
    const v = await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "x",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    const out = rig.registry.suggestQueries({ dbId: v.dbId, tenantId: "t1" });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("DatabaseRegistry — list", () => {
  beforeEach(() => {
    /* nothing */
  });
  it("lists only the tenant's dbs", async () => {
    const rig = makeRig();
    await rig.registry.provision({
      tenantId: "t1",
      type: "postgres",
      name: "a",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "alice",
    });
    await rig.registry.provision({
      tenantId: "t2",
      type: "postgres",
      name: "b",
      region: "us-east-1",
      sizeTier: "starter",
      requesterId: "bob",
    });
    const list1 = rig.registry.list("t1");
    const list2 = rig.registry.list("t2");
    expect(list1.length).toBe(1);
    expect(list2.length).toBe(1);
    expect(list1[0]?.tenantId).toBe("t1");
  });
});
