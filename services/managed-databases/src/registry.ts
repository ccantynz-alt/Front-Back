// ── Database Registry ─────────────────────────────────────────────────
// In-memory authoritative store for the managed-databases control plane.
// Persists encrypted ConnectionStringRefs only — never plaintext.
//
// Responsibilities
//  - Provision via a typed `DbProvisioner` (mocked in tests).
//  - Encrypt connection strings with per-tenant DEKs derived from the
//    master KEK before storing them.
//  - Enforce per-tenant quotas (default 5).
//  - Track snapshots, branches, soft-deletes (7-day recovery window).
//  - Coordinate credential rotation with a configurable grace period
//    during which the previous credentials remain valid for in-flight
//    workloads (default 60s).
//
// This module is deliberately pure: no HTTP, no env reads. The HTTP
// surface lives in `server.ts`, and `index.ts` wires env to here.

import { randomUUID } from "node:crypto";

import { AuditLogger } from "./audit";
import {
  decryptConnectionString,
  deriveTenantDek,
  encryptConnectionString,
} from "./crypto";
import type {
  BranchRequest,
  DbProvisioner,
  DeprovisionRequest,
  ProvisionRequest,
  RestoreRequest,
  RotateRequest,
  SnapshotRequest,
} from "./provisioners";
import type {
  AuditEntry,
  BranchRecord,
  Clock,
  ConnectionStringRef,
  DatabaseRecord,
  DbStatus,
  DbType,
  Region,
  SizeTier,
  SnapshotRecord,
} from "./types";

const SOFT_DELETE_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_ROTATION_GRACE_MS = 60_000; // 60 seconds
const DEFAULT_QUOTA_PER_TENANT = 5;
const DEFAULT_SNAPSHOT_RETENTION_DAYS = 7;

export interface RegistryOptions {
  readonly masterKey: Buffer;
  readonly provisioners: ReadonlyMap<DbType, DbProvisioner>;
  readonly audit?: AuditLogger;
  readonly clock?: Clock;
  readonly quotaPerTenant?: number;
  readonly rotationGraceMs?: number;
  readonly idGenerator?: () => string;
}

export class QuotaExceededError extends Error {
  constructor(public readonly tenantId: string, public readonly limit: number) {
    super(`tenant ${tenantId} has reached the ${limit}-database quota`);
    this.name = "QuotaExceededError";
  }
}

export class NotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} ${id} not found`);
    this.name = "NotFoundError";
  }
}

export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOperationError";
  }
}

export class TenantMismatchError extends Error {
  constructor() {
    super("tenant does not own this resource");
    this.name = "TenantMismatchError";
  }
}

export interface ProvisionInput {
  readonly tenantId: string;
  readonly type: DbType;
  readonly name: string;
  readonly region: Region;
  readonly sizeTier: SizeTier;
  readonly requesterId: string;
}

export interface SnapshotInput {
  readonly dbId: string;
  readonly tenantId: string;
  readonly trigger: "manual" | "nightly";
  readonly retentionDays?: number;
  readonly requesterId: string;
}

export interface RestoreInput {
  readonly snapshotId: string;
  readonly tenantId: string;
  readonly requesterId: string;
}

export interface BranchInput {
  readonly dbId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly fromSnapshotId?: string;
  readonly requesterId: string;
}

export interface PublicDbView {
  readonly dbId: string;
  readonly tenantId: string;
  readonly type: DbType;
  readonly name: string;
  readonly region: Region;
  readonly sizeTier: SizeTier;
  readonly status: DbStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly softDeletedAt: number | null;
}

export class DatabaseRegistry {
  private readonly masterKey: Buffer;
  private readonly provisioners: ReadonlyMap<DbType, DbProvisioner>;
  private readonly audit: AuditLogger;
  private readonly clock: Clock;
  private readonly quotaPerTenant: number;
  private readonly rotationGraceMs: number;
  private readonly idGen: () => string;

  private readonly databases = new Map<string, DatabaseRecord>();
  private readonly snapshots = new Map<string, SnapshotRecord>();
  private readonly branches = new Map<string, BranchRecord>();

  constructor(options: RegistryOptions) {
    this.masterKey = options.masterKey;
    this.provisioners = options.provisioners;
    this.audit = options.audit ?? new AuditLogger();
    this.clock = options.clock ?? Date.now;
    this.quotaPerTenant = options.quotaPerTenant ?? DEFAULT_QUOTA_PER_TENANT;
    this.rotationGraceMs = options.rotationGraceMs ?? DEFAULT_ROTATION_GRACE_MS;
    this.idGen = options.idGenerator ?? (() => randomUUID());
  }

  // ── Provision ──────────────────────────────────────────────────────
  async provision(input: ProvisionInput): Promise<PublicDbView> {
    const provisioner = this.provisioners.get(input.type);
    if (!provisioner) {
      this.audit.log({
        dbId: null,
        tenantId: input.tenantId,
        action: "PROVISION",
        requesterId: input.requesterId,
        result: "error",
        error: `unsupported db type: ${input.type}`,
      });
      throw new UnsupportedOperationError(`unsupported db type: ${input.type}`);
    }

    // Quota check (active = not soft-deleted).
    const active = this.activeForTenant(input.tenantId).length;
    if (active >= this.quotaPerTenant) {
      this.audit.log({
        dbId: null,
        tenantId: input.tenantId,
        action: "QUOTA_REJECT",
        requesterId: input.requesterId,
        result: "error",
        error: `quota=${this.quotaPerTenant}`,
      });
      throw new QuotaExceededError(input.tenantId, this.quotaPerTenant);
    }

    const dbId = this.idGen();
    const now = this.clock();

    const provisionReq: ProvisionRequest = {
      dbId,
      tenantId: input.tenantId,
      name: input.name,
      region: input.region,
      sizeTier: input.sizeTier,
    };

    const result = await provisioner.provision(provisionReq);
    const dek = deriveTenantDek(this.masterKey, input.tenantId);
    const encrypted = encryptConnectionString(
      dek,
      input.tenantId,
      dbId,
      result.connectionString,
    );

    const record: DatabaseRecord = {
      dbId,
      tenantId: input.tenantId,
      type: input.type,
      name: input.name,
      region: input.region,
      sizeTier: input.sizeTier,
      status: "ready",
      connectionStringRef: { current: encrypted },
      externalRefs: { ...result.externalRefs },
      createdAt: now,
      updatedAt: now,
    };
    this.databases.set(dbId, record);

    this.audit.log({
      dbId,
      tenantId: input.tenantId,
      action: "PROVISION",
      requesterId: input.requesterId,
      result: "ok",
    });

    return toPublicView(record);
  }

  // ── Read state ─────────────────────────────────────────────────────
  get(dbId: string, tenantId: string): PublicDbView {
    const record = this.requireOwned(dbId, tenantId);
    return toPublicView(record);
  }

  list(tenantId: string): ReadonlyArray<PublicDbView> {
    const out: PublicDbView[] = [];
    for (const r of this.databases.values()) {
      if (r.tenantId === tenantId) out.push(toPublicView(r));
    }
    return out;
  }

  // ── Connection string fetch (audited) ──────────────────────────────
  getConnectionString(input: {
    dbId: string;
    tenantId: string;
    requesterId: string;
  }): string {
    const record = this.requireOwned(input.dbId, input.tenantId);
    if (record.status === "soft_deleted") {
      this.audit.log({
        dbId: input.dbId,
        tenantId: input.tenantId,
        action: "GET_CONNECTION_STRING",
        requesterId: input.requesterId,
        result: "error",
        error: "soft_deleted",
      });
      throw new NotFoundError("database", input.dbId);
    }
    const dek = deriveTenantDek(this.masterKey, input.tenantId);
    const plain = decryptConnectionString(
      dek,
      input.tenantId,
      input.dbId,
      record.connectionStringRef.current,
    );
    this.audit.log({
      dbId: input.dbId,
      tenantId: input.tenantId,
      action: "GET_CONNECTION_STRING",
      requesterId: input.requesterId,
      result: "ok",
    });
    return plain;
  }

  /** Returns the previous (rotated-out) credentials if still in grace. */
  getPreviousConnectionString(input: {
    dbId: string;
    tenantId: string;
  }): string | null {
    const record = this.requireOwned(input.dbId, input.tenantId);
    const ref = record.connectionStringRef;
    if (!ref.previous || ref.previousRevokeAt === undefined) return null;
    if (this.clock() >= ref.previousRevokeAt) return null;
    const dek = deriveTenantDek(this.masterKey, input.tenantId);
    return decryptConnectionString(dek, input.tenantId, input.dbId, ref.previous);
  }

  // ── Snapshots ─────────────────────────────────────────────────────
  async createSnapshot(input: SnapshotInput): Promise<SnapshotRecord> {
    const record = this.requireOwned(input.dbId, input.tenantId);
    const provisioner = this.requireProvisioner(record.type);
    const snapshotId = this.idGen();
    const req: SnapshotRequest = {
      dbId: record.dbId,
      snapshotId,
      externalRefs: record.externalRefs,
    };
    const result = await provisioner.snapshot(req);
    const snap: SnapshotRecord = {
      snapshotId,
      dbId: record.dbId,
      sizeBytes: result.sizeBytes,
      createdAt: this.clock(),
      retentionDays: input.retentionDays ?? DEFAULT_SNAPSHOT_RETENTION_DAYS,
      trigger: input.trigger,
      externalRefs: { ...result.externalRefs },
    };
    this.snapshots.set(snapshotId, snap);
    this.audit.log({
      dbId: record.dbId,
      tenantId: input.tenantId,
      action: "SNAPSHOT_CREATE",
      requesterId: input.requesterId,
      result: "ok",
    });
    return snap;
  }

  listSnapshots(dbId: string, tenantId: string): ReadonlyArray<SnapshotRecord> {
    this.requireOwned(dbId, tenantId);
    const out: SnapshotRecord[] = [];
    for (const s of this.snapshots.values()) {
      if (s.dbId === dbId) out.push(s);
    }
    return out;
  }

  async restoreSnapshot(input: RestoreInput): Promise<PublicDbView> {
    const snap = this.snapshots.get(input.snapshotId);
    if (!snap) throw new NotFoundError("snapshot", input.snapshotId);
    const record = this.requireOwned(snap.dbId, input.tenantId);
    const provisioner = this.requireProvisioner(record.type);
    const req: RestoreRequest = {
      dbId: record.dbId,
      snapshotId: input.snapshotId,
      externalRefs: record.externalRefs,
    };
    const result = await provisioner.restore(req);
    const dek = deriveTenantDek(this.masterKey, record.tenantId);
    const newEncrypted = encryptConnectionString(
      dek,
      record.tenantId,
      record.dbId,
      result.connectionString,
    );
    const updated: DatabaseRecord = {
      ...record,
      status: "ready",
      connectionStringRef: { current: newEncrypted },
      externalRefs: { ...record.externalRefs, ...result.externalRefs },
      updatedAt: this.clock(),
    };
    this.databases.set(updated.dbId, updated);
    this.audit.log({
      dbId: record.dbId,
      tenantId: input.tenantId,
      action: "SNAPSHOT_RESTORE",
      requesterId: input.requesterId,
      result: "ok",
    });
    return toPublicView(updated);
  }

  // ── Branches (Postgres only) ──────────────────────────────────────
  async createBranch(input: BranchInput): Promise<BranchRecord> {
    const record = this.requireOwned(input.dbId, input.tenantId);
    const provisioner = this.requireProvisioner(record.type);
    if (!provisioner.supportsBranching) {
      this.audit.log({
        dbId: record.dbId,
        tenantId: input.tenantId,
        action: "BRANCH_CREATE",
        requesterId: input.requesterId,
        result: "error",
        error: `${record.type} does not support branching`,
      });
      throw new UnsupportedOperationError(
        `${record.type} does not support branching`,
      );
    }
    const branchId = this.idGen();
    const req: BranchRequest = {
      dbId: record.dbId,
      branchId,
      name: input.name,
      ...(input.fromSnapshotId !== undefined ? { fromSnapshotId: input.fromSnapshotId } : {}),
      externalRefs: record.externalRefs,
    };
    const result = await provisioner.branch(req);
    // We don't persist the branch's own connection string in plaintext —
    // branches get their connection string on creation only and are
    // re-fetchable via the standard connection-string flow on the parent
    // db (Neon's branch credentials are tied to the project role).
    void result.connectionString;
    const branch: BranchRecord = {
      branchId,
      dbId: record.dbId,
      name: input.name,
      ...(input.fromSnapshotId !== undefined ? { fromSnapshotId: input.fromSnapshotId } : {}),
      createdAt: this.clock(),
      externalRefs: { ...result.externalRefs },
    };
    this.branches.set(branchId, branch);
    this.audit.log({
      dbId: record.dbId,
      tenantId: input.tenantId,
      action: "BRANCH_CREATE",
      requesterId: input.requesterId,
      result: "ok",
    });
    return branch;
  }

  listBranches(dbId: string, tenantId: string): ReadonlyArray<BranchRecord> {
    this.requireOwned(dbId, tenantId);
    const out: BranchRecord[] = [];
    for (const b of this.branches.values()) {
      if (b.dbId === dbId) out.push(b);
    }
    return out;
  }

  // ── Credential rotation ──────────────────────────────────────────
  async rotateCredentials(input: {
    dbId: string;
    tenantId: string;
    requesterId: string;
  }): Promise<PublicDbView> {
    const record = this.requireOwned(input.dbId, input.tenantId);
    const provisioner = this.requireProvisioner(record.type);
    const req: RotateRequest = {
      dbId: record.dbId,
      externalRefs: record.externalRefs,
    };
    const result = await provisioner.rotate(req);
    const dek = deriveTenantDek(this.masterKey, record.tenantId);
    const newEncrypted = encryptConnectionString(
      dek,
      record.tenantId,
      record.dbId,
      result.connectionString,
    );
    const now = this.clock();
    const ref: ConnectionStringRef = {
      current: newEncrypted,
      previous: record.connectionStringRef.current,
      previousRevokeAt: now + this.rotationGraceMs,
    };
    const updated: DatabaseRecord = {
      ...record,
      connectionStringRef: ref,
      externalRefs: { ...record.externalRefs, ...result.externalRefs },
      updatedAt: now,
      status: "ready",
    };
    this.databases.set(record.dbId, updated);
    this.audit.log({
      dbId: record.dbId,
      tenantId: input.tenantId,
      action: "ROTATE_CREDENTIALS",
      requesterId: input.requesterId,
      result: "ok",
    });
    return toPublicView(updated);
  }

  // ── Soft delete + recover ────────────────────────────────────────
  softDelete(input: {
    dbId: string;
    tenantId: string;
    requesterId: string;
  }): PublicDbView {
    const record = this.requireOwned(input.dbId, input.tenantId);
    if (record.status === "soft_deleted") return toPublicView(record);
    const updated: DatabaseRecord = {
      ...record,
      status: "soft_deleted",
      softDeletedAt: this.clock(),
      updatedAt: this.clock(),
    };
    this.databases.set(record.dbId, updated);
    this.audit.log({
      dbId: record.dbId,
      tenantId: input.tenantId,
      action: "SOFT_DELETE",
      requesterId: input.requesterId,
      result: "ok",
    });
    return toPublicView(updated);
  }

  recover(input: {
    dbId: string;
    tenantId: string;
    requesterId: string;
  }): PublicDbView {
    const record = this.requireOwned(input.dbId, input.tenantId);
    if (record.status !== "soft_deleted" || record.softDeletedAt === undefined) {
      throw new UnsupportedOperationError("database is not soft-deleted");
    }
    const elapsed = this.clock() - record.softDeletedAt;
    if (elapsed > SOFT_DELETE_RECOVERY_MS) {
      throw new UnsupportedOperationError("recovery window expired");
    }
    const recoveredBase: Omit<DatabaseRecord, "softDeletedAt"> = {
      dbId: record.dbId,
      tenantId: record.tenantId,
      type: record.type,
      name: record.name,
      region: record.region,
      sizeTier: record.sizeTier,
      status: "ready",
      connectionStringRef: record.connectionStringRef,
      externalRefs: record.externalRefs,
      createdAt: record.createdAt,
      updatedAt: this.clock(),
    };
    const recovered: DatabaseRecord = recoveredBase;
    this.databases.set(record.dbId, recovered);
    this.audit.log({
      dbId: record.dbId,
      tenantId: input.tenantId,
      action: "RECOVER",
      requesterId: input.requesterId,
      result: "ok",
    });
    return toPublicView(recovered);
  }

  /** Permanently destroy a soft-deleted db whose recovery window expired. */
  async purgeIfExpired(dbId: string): Promise<boolean> {
    const record = this.databases.get(dbId);
    if (!record || record.status !== "soft_deleted") return false;
    if (record.softDeletedAt === undefined) return false;
    if (this.clock() - record.softDeletedAt < SOFT_DELETE_RECOVERY_MS) return false;
    const provisioner = this.provisioners.get(record.type);
    if (provisioner) {
      const req: DeprovisionRequest = {
        dbId: record.dbId,
        externalRefs: record.externalRefs,
      };
      await provisioner.deprovision(req);
    }
    this.databases.delete(dbId);
    for (const [sid, snap] of this.snapshots) {
      if (snap.dbId === dbId) this.snapshots.delete(sid);
    }
    for (const [bid, branch] of this.branches) {
      if (branch.dbId === dbId) this.branches.delete(bid);
    }
    this.audit.log({
      dbId,
      tenantId: record.tenantId,
      action: "DEPROVISION",
      requesterId: "system",
      result: "ok",
    });
    return true;
  }

  // ── AI query suggestion v2 hook ──────────────────────────────────
  // Reserved extensibility point — downstream AI services can register a
  // suggestion callback that receives db metadata (never the connection
  // string). Implemented as a no-op stub now; v2 will plug a streaming
  // suggestion feed in here.
  suggestQueries(input: {
    dbId: string;
    tenantId: string;
  }): ReadonlyArray<string> {
    const record = this.requireOwned(input.dbId, input.tenantId);
    return [
      `-- ${record.type} suggestions for ${record.name} (v2 hook)`,
    ];
  }

  // ── Internal helpers ─────────────────────────────────────────────
  private activeForTenant(tenantId: string): DatabaseRecord[] {
    const out: DatabaseRecord[] = [];
    for (const r of this.databases.values()) {
      if (r.tenantId === tenantId && r.status !== "soft_deleted") out.push(r);
    }
    return out;
  }

  private requireOwned(dbId: string, tenantId: string): DatabaseRecord {
    const record = this.databases.get(dbId);
    if (!record) throw new NotFoundError("database", dbId);
    if (record.tenantId !== tenantId) throw new TenantMismatchError();
    return record;
  }

  private requireProvisioner(type: DbType): DbProvisioner {
    const p = this.provisioners.get(type);
    if (!p) throw new UnsupportedOperationError(`no provisioner for ${type}`);
    return p;
  }
}

function toPublicView(record: DatabaseRecord): PublicDbView {
  return {
    dbId: record.dbId,
    tenantId: record.tenantId,
    type: record.type,
    name: record.name,
    region: record.region,
    sizeTier: record.sizeTier,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    softDeletedAt: record.softDeletedAt ?? null,
  };
}

export type { AuditEntry };
