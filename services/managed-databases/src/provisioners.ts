// ── Provisioner Interface + Implementations ───────────────────────────
// The control plane talks to two backends through a driver-agnostic
// `DbProvisioner` interface:
//
//   * NeonProvisioner    — Postgres via the Neon HTTP API
//   * RedisLocalProvisioner — Redis ACL user + DB number on a self-
//                              hosted bare-metal cluster
//
// Both implementations are mocked in tests via constructor-injectable
// transport functions so we never hit the network in CI.

import type { DbType, Region, SizeTier } from "./types";

export interface ProvisionRequest {
  readonly dbId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly region: Region;
  readonly sizeTier: SizeTier;
}

export interface ProvisionResult {
  /** Plaintext connection string returned ONLY to the registry, which
   * encrypts it before persistence. */
  readonly connectionString: string;
  /** Provider-assigned identifiers (project_id, role, etc.). */
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface BranchRequest {
  readonly dbId: string;
  readonly branchId: string;
  readonly name: string;
  readonly fromSnapshotId?: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface BranchResult {
  readonly connectionString: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface SnapshotRequest {
  readonly dbId: string;
  readonly snapshotId: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface SnapshotResult {
  readonly sizeBytes: number;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface RestoreRequest {
  readonly dbId: string;
  readonly snapshotId: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface RestoreResult {
  readonly connectionString: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface RotateRequest {
  readonly dbId: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface RotateResult {
  readonly connectionString: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface DeprovisionRequest {
  readonly dbId: string;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface DbProvisioner {
  readonly type: DbType;
  /** True if this driver supports copy-on-write branching. */
  readonly supportsBranching: boolean;
  provision(req: ProvisionRequest): Promise<ProvisionResult>;
  branch(req: BranchRequest): Promise<BranchResult>;
  snapshot(req: SnapshotRequest): Promise<SnapshotResult>;
  restore(req: RestoreRequest): Promise<RestoreResult>;
  rotate(req: RotateRequest): Promise<RotateResult>;
  deprovision(req: DeprovisionRequest): Promise<void>;
}

// ── Neon (Postgres) ──────────────────────────────────────────────────
// Talks to Neon's HTTP API. Transport is injected so tests can stub it.

export type NeonTransport = (
  path: string,
  init: { method: string; body?: unknown },
) => Promise<unknown>;

export interface NeonProvisionerOptions {
  readonly transport: NeonTransport;
}

interface NeonProjectResponse {
  readonly project_id: string;
  readonly database: string;
  readonly role: string;
  readonly host: string;
  readonly password: string;
}

interface NeonBranchResponse {
  readonly branch_id: string;
  readonly host: string;
  readonly password: string;
}

interface NeonSnapshotResponse {
  readonly snapshot_id: string;
  readonly size_bytes: number;
}

interface NeonRotateResponse {
  readonly password: string;
  readonly host: string;
}

export class NeonProvisioner implements DbProvisioner {
  readonly type: DbType = "postgres";
  readonly supportsBranching = true;
  private readonly transport: NeonTransport;

  constructor(options: NeonProvisionerOptions) {
    this.transport = options.transport;
  }

  async provision(req: ProvisionRequest): Promise<ProvisionResult> {
    const res = (await this.transport("/projects", {
      method: "POST",
      body: {
        name: req.name,
        region_id: req.region,
        size_tier: req.sizeTier,
        idem: req.dbId,
      },
    })) as NeonProjectResponse;
    const cs = `postgres://${res.role}:${res.password}@${res.host}/${res.database}?sslmode=require`;
    return {
      connectionString: cs,
      externalRefs: {
        project_id: res.project_id,
        role: res.role,
        host: res.host,
        database: res.database,
      },
    };
  }

  async branch(req: BranchRequest): Promise<BranchResult> {
    const projectId = req.externalRefs["project_id"];
    if (!projectId) throw new Error("missing project_id in externalRefs");
    const role = req.externalRefs["role"] ?? "app";
    const database = req.externalRefs["database"] ?? "main";
    const res = (await this.transport(`/projects/${projectId}/branches`, {
      method: "POST",
      body: {
        name: req.name,
        ...(req.fromSnapshotId !== undefined ? { from_snapshot: req.fromSnapshotId } : {}),
      },
    })) as NeonBranchResponse;
    const cs = `postgres://${role}:${res.password}@${res.host}/${database}?sslmode=require`;
    return {
      connectionString: cs,
      externalRefs: { branch_id: res.branch_id, host: res.host },
    };
  }

  async snapshot(req: SnapshotRequest): Promise<SnapshotResult> {
    const projectId = req.externalRefs["project_id"];
    if (!projectId) throw new Error("missing project_id in externalRefs");
    const res = (await this.transport(`/projects/${projectId}/snapshots`, {
      method: "POST",
      body: { idem: req.snapshotId },
    })) as NeonSnapshotResponse;
    return {
      sizeBytes: res.size_bytes,
      externalRefs: { neon_snapshot_id: res.snapshot_id },
    };
  }

  async restore(req: RestoreRequest): Promise<RestoreResult> {
    // Postgres restore == new branch from snapshot.
    const projectId = req.externalRefs["project_id"];
    if (!projectId) throw new Error("missing project_id in externalRefs");
    const role = req.externalRefs["role"] ?? "app";
    const database = req.externalRefs["database"] ?? "main";
    const res = (await this.transport(`/projects/${projectId}/branches`, {
      method: "POST",
      body: { name: `restore-${req.snapshotId}`, from_snapshot: req.snapshotId },
    })) as NeonBranchResponse;
    const cs = `postgres://${role}:${res.password}@${res.host}/${database}?sslmode=require`;
    return {
      connectionString: cs,
      externalRefs: { branch_id: res.branch_id, host: res.host },
    };
  }

  async rotate(req: RotateRequest): Promise<RotateResult> {
    const projectId = req.externalRefs["project_id"];
    if (!projectId) throw new Error("missing project_id in externalRefs");
    const role = req.externalRefs["role"] ?? "app";
    const database = req.externalRefs["database"] ?? "main";
    const res = (await this.transport(`/projects/${projectId}/credentials`, {
      method: "POST",
      body: { rotate: true },
    })) as NeonRotateResponse;
    const cs = `postgres://${role}:${res.password}@${res.host}/${database}?sslmode=require`;
    return { connectionString: cs, externalRefs: { host: res.host } };
  }

  async deprovision(req: DeprovisionRequest): Promise<void> {
    const projectId = req.externalRefs["project_id"];
    if (!projectId) return;
    await this.transport(`/projects/${projectId}`, { method: "DELETE" });
  }
}

// ── Redis Local Cluster ──────────────────────────────────────────────
// Allocates an ACL user + DB index on a configured cluster. Talks to the
// cluster via an injected command function (in production this is a
// redis-cli wrapper or a Hono-served admin endpoint on the cluster head).

export type RedisCommand = (
  command: string,
  args: ReadonlyArray<string>,
) => Promise<string>;

export interface RedisLocalProvisionerOptions {
  readonly command: RedisCommand;
  readonly clusterHost: string;
  readonly clusterPort: number;
}

export class RedisLocalProvisioner implements DbProvisioner {
  readonly type: DbType = "redis";
  readonly supportsBranching = false;
  private readonly command: RedisCommand;
  private readonly clusterHost: string;
  private readonly clusterPort: number;

  constructor(options: RedisLocalProvisionerOptions) {
    this.command = options.command;
    this.clusterHost = options.clusterHost;
    this.clusterPort = options.clusterPort;
  }

  async provision(req: ProvisionRequest): Promise<ProvisionResult> {
    const user = `t-${req.tenantId}-${req.dbId}`;
    const password = await this.command("ACL_CREATE", [user, req.sizeTier]);
    const dbIndex = await this.command("ALLOC_DB", [req.dbId]);
    const cs = `redis://${user}:${password}@${this.clusterHost}:${this.clusterPort}/${dbIndex}`;
    return {
      connectionString: cs,
      externalRefs: { user, db_index: dbIndex },
    };
  }

  async branch(_req: BranchRequest): Promise<BranchResult> {
    throw new Error("redis does not support branching");
  }

  async snapshot(req: SnapshotRequest): Promise<SnapshotResult> {
    const dbIndex = req.externalRefs["db_index"];
    if (!dbIndex) throw new Error("missing db_index in externalRefs");
    const sizeStr = await this.command("SNAPSHOT", [dbIndex, req.snapshotId]);
    return {
      sizeBytes: Number.parseInt(sizeStr, 10) || 0,
      externalRefs: { rdb_path: `/snapshots/${req.snapshotId}.rdb` },
    };
  }

  async restore(req: RestoreRequest): Promise<RestoreResult> {
    const dbIndex = req.externalRefs["db_index"];
    const user = req.externalRefs["user"];
    if (!dbIndex || !user) throw new Error("missing externalRefs");
    const password = await this.command("RESTORE", [dbIndex, req.snapshotId]);
    const cs = `redis://${user}:${password}@${this.clusterHost}:${this.clusterPort}/${dbIndex}`;
    return { connectionString: cs, externalRefs: {} };
  }

  async rotate(req: RotateRequest): Promise<RotateResult> {
    const user = req.externalRefs["user"];
    const dbIndex = req.externalRefs["db_index"];
    if (!user || !dbIndex) throw new Error("missing externalRefs");
    const password = await this.command("ACL_ROTATE", [user]);
    const cs = `redis://${user}:${password}@${this.clusterHost}:${this.clusterPort}/${dbIndex}`;
    return { connectionString: cs, externalRefs: {} };
  }

  async deprovision(req: DeprovisionRequest): Promise<void> {
    const user = req.externalRefs["user"];
    const dbIndex = req.externalRefs["db_index"];
    if (user) await this.command("ACL_DELETE", [user]);
    if (dbIndex) await this.command("FREE_DB", [dbIndex]);
  }
}
