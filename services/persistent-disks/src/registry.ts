// ── Persistent Disks — Registry (control-plane state machine) ─────────
// In-memory registry that owns the lifecycle of every volume and
// snapshot. Pure TypeScript, no I/O of its own — it delegates the
// actual block-device work to a `DiskDriver`. That separation keeps
// the state machine deterministic and trivially testable.
//
// State machine for a Volume:
//
//      ┌──────────┐  driver.create OK   ┌────────────┐
//      │ creating │ ──────────────────▶ │ available  │
//      └────┬─────┘                     └─────┬──────┘
//           │ driver.create FAIL              │ attach
//           ▼                                 ▼
//        (deleted)                       ┌──────────┐
//                                        │ attached │
//                                        └─────┬────┘
//                                              │ detach
//                                              ▼
//                                        ┌────────────┐
//                                        │ available  │
//                                        └─────┬──────┘
//                                              │ delete (only if not attached)
//                                              ▼
//                                          ┌──────────┐
//                                          │ deleting │ ──▶ removed
//                                          └──────────┘
//
// All transitions enforce status guards. Quota enforcement happens at
// create-time (and at restore-into-new-volume time). Resize is grow-
// only by design — shrinking ext4 / nfs reliably is a footgun that
// belongs to a future opt-in workflow, not the v1 hot path.

import type { DiskDriver } from "./driver";
import {
  DEFAULT_QUOTA_BYTES,
  DisksError,
  type AttachInput,
  type CreateVolumeInput,
  type DiskQuota,
  type RestoreInput,
  type Snapshot,
  type Volume,
  type VolumeFs,
} from "./types";

export interface RegistryOptions {
  driver: DiskDriver;
  /** Override the per-tenant default quota. */
  defaultQuotaBytes?: number;
  /** Injectable for deterministic tests. */
  now?: () => Date;
  /** Injectable for deterministic tests. */
  generateId?: (kind: "vol" | "snap") => string;
}

export class DiskRegistry {
  private readonly driver: DiskDriver;
  private readonly defaultQuotaBytes: number;
  private readonly now: () => Date;
  private readonly genId: (kind: "vol" | "snap") => string;

  private readonly volumes = new Map<string, Volume>();
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly quotas = new Map<string, DiskQuota>();

  constructor(opts: RegistryOptions) {
    this.driver = opts.driver;
    this.defaultQuotaBytes = opts.defaultQuotaBytes ?? DEFAULT_QUOTA_BYTES;
    this.now = opts.now ?? (() => new Date());
    let counter = 0;
    this.genId =
      opts.generateId ??
      ((kind) => {
        counter += 1;
        return `${kind}_${this.now().getTime()}_${counter}`;
      });
  }

  // ── Quota management ───────────────────────────────────────────────

  setQuota(quota: DiskQuota): void {
    if (quota.maxBytes < 0) {
      throw new DisksError(400, "quota_invalid", "maxBytes must be ≥ 0");
    }
    this.quotas.set(quota.tenantId, quota);
  }

  getQuota(tenantId: string): DiskQuota {
    return (
      this.quotas.get(tenantId) ?? {
        tenantId,
        maxBytes: this.defaultQuotaBytes,
      }
    );
  }

  /** Sum of sizeBytes across non-deleting volumes for a tenant. */
  usedBytes(tenantId: string): number {
    let total = 0;
    for (const v of this.volumes.values()) {
      if (v.tenantId === tenantId && v.status !== "deleting") total += v.sizeBytes;
    }
    return total;
  }

  // ── Volume lifecycle ───────────────────────────────────────────────

  async createVolume(input: CreateVolumeInput): Promise<Volume> {
    if (input.sizeBytes <= 0) {
      throw new DisksError(400, "size_invalid", "sizeBytes must be > 0");
    }
    if (!input.name || input.name.length > 100) {
      throw new DisksError(400, "name_invalid", "name must be 1-100 chars");
    }
    this.assertQuota(input.tenantId, input.sizeBytes);

    const volumeId = this.genId("vol");
    const stamp = this.now().toISOString();
    const volume: Volume = {
      volumeId,
      tenantId: input.tenantId,
      name: input.name,
      sizeBytes: input.sizeBytes,
      fs: input.fs,
      status: "creating",
      attachedTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.volumes.set(volumeId, volume);

    try {
      const handle = await this.driver.create({
        volumeId,
        sizeBytes: input.sizeBytes,
        fs: input.fs,
      });
      // Honour any backend-reported capacity that exceeds the request
      // (some allocators round up). We never shrink the registry size.
      const finalSize = Math.max(handle.capacityBytes, input.sizeBytes);
      const next = this.touch({ ...volume, sizeBytes: finalSize, status: "available" });
      this.volumes.set(volumeId, next);
      return next;
    } catch (err) {
      this.volumes.delete(volumeId);
      throw err;
    }
  }

  getVolume(volumeId: string): Volume {
    const v = this.volumes.get(volumeId);
    if (!v) throw new DisksError(404, "volume_not_found", `volume ${volumeId} not found`);
    return v;
  }

  listVolumes(tenantId?: string): readonly Volume[] {
    const all = Array.from(this.volumes.values());
    return tenantId === undefined ? all : all.filter((v) => v.tenantId === tenantId);
  }

  async attachVolume(volumeId: string, input: AttachInput): Promise<Volume> {
    const v = this.getVolume(volumeId);
    if (v.status !== "available") {
      throw new DisksError(
        409,
        "volume_not_available",
        `volume ${volumeId} is ${v.status}, not available`,
      );
    }
    if (!input.workerId || !input.mountPath || !input.mountPath.startsWith("/")) {
      throw new DisksError(400, "attach_invalid", "workerId and absolute mountPath required");
    }
    const next = this.touch({
      ...v,
      status: "attached",
      attachedTo: { workerId: input.workerId, mountPath: input.mountPath },
    });
    this.volumes.set(volumeId, next);
    return next;
  }

  async detachVolume(volumeId: string): Promise<Volume> {
    const v = this.getVolume(volumeId);
    if (v.status !== "attached") {
      throw new DisksError(
        409,
        "volume_not_attached",
        `volume ${volumeId} is not attached`,
      );
    }
    const next = this.touch({ ...v, status: "available", attachedTo: null });
    this.volumes.set(volumeId, next);
    return next;
  }

  async resizeVolume(volumeId: string, newSizeBytes: number): Promise<Volume> {
    const v = this.getVolume(volumeId);
    if (v.status === "deleting" || v.status === "creating") {
      throw new DisksError(
        409,
        "volume_busy",
        `volume ${volumeId} is ${v.status}; cannot resize`,
      );
    }
    if (newSizeBytes < v.sizeBytes) {
      throw new DisksError(
        400,
        "resize_shrink_forbidden",
        "resize is grow-only — newSizeBytes must be ≥ current sizeBytes",
      );
    }
    if (newSizeBytes === v.sizeBytes) {
      return v; // no-op
    }
    // Quota check uses the *delta* on top of current usage.
    const delta = newSizeBytes - v.sizeBytes;
    const quota = this.getQuota(v.tenantId);
    if (this.usedBytes(v.tenantId) + delta > quota.maxBytes) {
      throw new DisksError(
        422,
        "quota_exceeded",
        `tenant ${v.tenantId} would exceed quota ${quota.maxBytes} bytes`,
      );
    }
    const handle = await this.driver.resize({ volumeId, newSizeBytes });
    const finalSize = Math.max(handle.capacityBytes, newSizeBytes);
    const next = this.touch({ ...v, sizeBytes: finalSize });
    this.volumes.set(volumeId, next);
    return next;
  }

  async deleteVolume(volumeId: string): Promise<void> {
    const v = this.getVolume(volumeId);
    if (v.status === "attached") {
      throw new DisksError(
        409,
        "volume_attached",
        `volume ${volumeId} is attached; detach before deleting`,
      );
    }
    if (v.status === "deleting") return;
    this.volumes.set(volumeId, this.touch({ ...v, status: "deleting" }));
    try {
      await this.driver.destroy({ volumeId });
    } finally {
      this.volumes.delete(volumeId);
    }
  }

  // ── Snapshot lifecycle ─────────────────────────────────────────────

  async createSnapshot(volumeId: string, opts?: { ttlMs?: number }): Promise<Snapshot> {
    const v = this.getVolume(volumeId);
    if (v.status !== "available" && v.status !== "attached") {
      throw new DisksError(
        409,
        "volume_not_snapshottable",
        `cannot snapshot volume ${volumeId} in status ${v.status}`,
      );
    }
    const payload = await this.driver.snapshot({ volume: v });
    const stamp = this.now();
    const snapshotId = this.genId("snap");
    const snapshot: Snapshot = {
      snapshotId,
      volumeId,
      tenantId: v.tenantId,
      sizeBytes: payload.sizeBytes,
      sha256: payload.sha256,
      createdAt: stamp.toISOString(),
      expiresAt:
        opts?.ttlMs !== undefined
          ? new Date(stamp.getTime() + opts.ttlMs).toISOString()
          : null,
    };
    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  getSnapshot(snapshotId: string): Snapshot {
    const s = this.snapshots.get(snapshotId);
    if (!s)
      throw new DisksError(404, "snapshot_not_found", `snapshot ${snapshotId} not found`);
    return s;
  }

  listSnapshots(volumeId?: string): readonly Snapshot[] {
    const all = Array.from(this.snapshots.values());
    return volumeId === undefined ? all : all.filter((s) => s.volumeId === volumeId);
  }

  async restoreSnapshot(
    snapshotId: string,
    input: RestoreInput,
  ): Promise<Volume> {
    const snap = this.getSnapshot(snapshotId);
    if (input.targetVolumeId !== undefined) {
      const target = this.getVolume(input.targetVolumeId);
      if (target.tenantId !== snap.tenantId) {
        throw new DisksError(
          403,
          "tenant_mismatch",
          "snapshot tenant does not match target volume tenant",
        );
      }
      if (target.status !== "available") {
        throw new DisksError(
          409,
          "target_not_available",
          "target volume must be available to restore",
        );
      }
      // Restore is only legal if target is at least as big as the snapshot.
      if (target.sizeBytes < snap.sizeBytes) {
        throw new DisksError(
          400,
          "target_too_small",
          "target volume is smaller than snapshot",
        );
      }
      const handle = await this.driver.restore({
        snapshot: snap,
        targetVolumeId: target.volumeId,
        sizeBytes: target.sizeBytes,
      });
      const next = this.touch({
        ...target,
        sizeBytes: Math.max(handle.capacityBytes, target.sizeBytes),
      });
      this.volumes.set(target.volumeId, next);
      return next;
    }

    // Restore into a brand-new volume — quota applies.
    const name = input.newVolumeName ?? `restore-of-${snap.volumeId}`;
    this.assertQuota(snap.tenantId, snap.sizeBytes);
    const newId = this.genId("vol");
    const fs = this.driver.defaultFs as VolumeFs;
    const stamp = this.now().toISOString();
    const placeholder: Volume = {
      volumeId: newId,
      tenantId: snap.tenantId,
      name,
      sizeBytes: snap.sizeBytes,
      fs,
      status: "creating",
      attachedTo: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.volumes.set(newId, placeholder);
    try {
      const handle = await this.driver.restore({
        snapshot: snap,
        targetVolumeId: newId,
        sizeBytes: snap.sizeBytes,
      });
      const next = this.touch({
        ...placeholder,
        sizeBytes: Math.max(handle.capacityBytes, snap.sizeBytes),
        status: "available",
      });
      this.volumes.set(newId, next);
      return next;
    } catch (err) {
      this.volumes.delete(newId);
      throw err;
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────

  private assertQuota(tenantId: string, addBytes: number): void {
    const quota = this.getQuota(tenantId);
    const used = this.usedBytes(tenantId);
    if (used + addBytes > quota.maxBytes) {
      throw new DisksError(
        422,
        "quota_exceeded",
        `tenant ${tenantId} quota ${quota.maxBytes}B exceeded (have ${used}B, requested +${addBytes}B)`,
      );
    }
  }

  private touch(v: Volume): Volume {
    return { ...v, updatedAt: this.now().toISOString() };
  }
}
