// ── Managed Databases Types ───────────────────────────────────────────
// Shared types for the control plane that manages Postgres (Neon) and
// Redis (self-hosted bare-metal cluster) databases.

export type DbType = "postgres" | "redis";

export type SizeTier = "starter" | "standard" | "pro";

export type DbStatus =
  | "provisioning"
  | "ready"
  | "rotating"
  | "deleting"
  | "soft_deleted"
  | "failed";

export type Region =
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "ap-southeast-1"
  | "ap-northeast-1";

export interface EncryptedBlob {
  readonly ciphertext: string;
}

export interface ConnectionStringRef {
  readonly current: EncryptedBlob;
  /** Previous credential set, kept until grace period elapses. */
  readonly previous?: EncryptedBlob;
  /** Epoch ms after which the previous credentials are revoked. */
  readonly previousRevokeAt?: number;
}

export interface DatabaseRecord {
  readonly dbId: string;
  readonly tenantId: string;
  readonly type: DbType;
  readonly name: string;
  readonly region: Region;
  readonly sizeTier: SizeTier;
  readonly status: DbStatus;
  readonly connectionStringRef: ConnectionStringRef;
  /** External provisioner-assigned IDs (e.g. neon project_id, redis user). */
  readonly externalRefs: Readonly<Record<string, string>>;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Set when the DB has been soft-deleted; recovery window is 7 days. */
  readonly softDeletedAt?: number;
}

export interface BranchRecord {
  readonly branchId: string;
  readonly dbId: string;
  readonly name: string;
  /** Optional snapshot the branch was created from (point-in-time). */
  readonly fromSnapshotId?: string;
  readonly createdAt: number;
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface SnapshotRecord {
  readonly snapshotId: string;
  readonly dbId: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  readonly retentionDays: number;
  readonly trigger: "manual" | "nightly";
  readonly externalRefs: Readonly<Record<string, string>>;
}

export interface AuditEntry {
  readonly dbId: string | null;
  readonly tenantId: string;
  readonly action: AuditAction;
  readonly requesterId: string;
  readonly timestamp: string;
  readonly result: "ok" | "error";
  readonly error?: string;
}

export type AuditAction =
  | "PROVISION"
  | "DEPROVISION"
  | "GET_CONNECTION_STRING"
  | "ROTATE_CREDENTIALS"
  | "SNAPSHOT_CREATE"
  | "SNAPSHOT_RESTORE"
  | "BRANCH_CREATE"
  | "SOFT_DELETE"
  | "RECOVER"
  | "AUTH_REJECT"
  | "QUOTA_REJECT";

export type AuditSink = (entry: AuditEntry) => void;
export type Clock = () => number;
