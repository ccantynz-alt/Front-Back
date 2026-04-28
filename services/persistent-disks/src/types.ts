// ── Persistent Disks — Types ──────────────────────────────────────────
// The shared, public type surface for the persistent-disks control
// plane. This module is the contract every other module (driver,
// registry, server, tests) agrees on.
//
// Concepts:
//   - Volume:   a tenant-owned block of storage with a name, size, fs,
//               and a status machine.
//   - Snapshot: an immutable point-in-time copy of a volume that can be
//               restored into a new volume or onto an existing one.
//   - Quota:    per-tenant ceiling on the sum of all volume sizes.
//
// This file is types-only — no runtime behaviour, no side effects.

export type VolumeFs = "ext4" | "nfs";

export type VolumeStatus =
  | "creating"
  | "available"
  | "attached"
  | "deleting";

export interface AttachmentRef {
  workerId: string;
  mountPath: string;
}

export interface Volume {
  volumeId: string;
  tenantId: string;
  name: string;
  sizeBytes: number;
  fs: VolumeFs;
  status: VolumeStatus;
  attachedTo: AttachmentRef | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface Snapshot {
  snapshotId: string;
  volumeId: string;
  tenantId: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateVolumeInput {
  tenantId: string;
  name: string;
  sizeBytes: number;
  fs: VolumeFs;
}

export interface AttachInput {
  workerId: string;
  mountPath: string;
}

export interface RestoreInput {
  /** If omitted, a new volume is provisioned from the snapshot. */
  targetVolumeId?: string;
  /** Required when restoring into a brand-new volume. */
  newVolumeName?: string;
}

export interface DiskQuota {
  tenantId: string;
  /** Maximum total bytes across all of the tenant's volumes. */
  maxBytes: number;
}

export const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024 * 1024; // 100 GiB

export class DisksError extends Error {
  public readonly status: number;
  public readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DisksError";
    this.status = status;
    this.code = code;
  }
}
