// ── Persistent Disks — Test Suite ─────────────────────────────────────
// Covers:
//   • Volume CRUD with the loopback driver (mocked Shell)
//   • Attach/detach state machine
//   • Resize is grow-only and quota-aware
//   • Quota rejection at create time and at restore-into-new-volume
//   • Snapshot creation + restore (deterministic hasher)
//   • Driver interface contract for both LocalLoopbackDriver + NfsDriver
//   • Auth rejection on the HTTP surface
//   • Deletion blocked while attached
// All shell calls and clock/ID generation are deterministic.

import { describe, expect, test } from "bun:test";

import {
  LocalLoopbackDriver,
  NfsDriver,
  type DiskDriver,
  type Shell,
  type ShellResult,
} from "./driver";
import { DiskRegistry } from "./registry";
import { buildApp } from "./server";

// ── Test doubles ───────────────────────────────────────────────────

class FakeShell implements Shell {
  public readonly calls: { cmd: string; args: readonly string[] }[] = [];
  private readonly responses = new Map<string, ShellResult>();
  private readonly defaultOk: ShellResult = { exitCode: 0, stdout: "", stderr: "" };
  setResponse(cmd: string, res: ShellResult): void {
    this.responses.set(cmd, res);
  }
  async run(cmd: string, args: readonly string[]): Promise<ShellResult> {
    this.calls.push({ cmd, args });
    return this.responses.get(cmd) ?? this.defaultOk;
  }
}

const detHash = (data: Uint8Array): string => {
  // Tiny deterministic FNV-1a — produces a 16-char hex string padded
  // out to 64 chars to look like a sha256.
  let h = 2166136261 >>> 0;
  for (const b of data) {
    h ^= b;
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0").repeat(8);
};

function fixedClock(): () => Date {
  let t = 1_700_000_000_000;
  return () => {
    t += 1000;
    return new Date(t);
  };
}

function counterIds(): (kind: "vol" | "snap") => string {
  let n = 0;
  return (kind) => {
    n += 1;
    return `${kind}_${n}`;
  };
}

function makeRegistry(driver: DiskDriver, defaultQuotaBytes?: number): DiskRegistry {
  return new DiskRegistry({
    driver,
    ...(defaultQuotaBytes !== undefined ? { defaultQuotaBytes } : {}),
    now: fixedClock(),
    generateId: counterIds(),
  });
}

function makeLoopback(shell: Shell): LocalLoopbackDriver {
  return new LocalLoopbackDriver({ rootDir: "/tmp/crontech-disks", shell, hash: detHash });
}

function makeNfs(shell: Shell): NfsDriver {
  return new NfsDriver({ exportRoot: "/mnt/nfs/crontech", shell, hash: detHash });
}

// ── Volume CRUD ────────────────────────────────────────────────────

describe("volume CRUD", () => {
  test("create → available with backend handle and capacity", async () => {
    const shell = new FakeShell();
    const reg = makeRegistry(makeLoopback(shell));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "data",
      sizeBytes: 1_000_000,
      fs: "ext4",
    });
    expect(v.status).toBe("available");
    expect(v.tenantId).toBe("t1");
    expect(v.sizeBytes).toBe(1_000_000);
    expect(v.attachedTo).toBeNull();
    // fallocate + mkfs.ext4 must both have been invoked.
    expect(shell.calls.map((c) => c.cmd)).toEqual(["fallocate", "mkfs.ext4"]);
  });

  test("get returns the same record", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "x",
      sizeBytes: 100,
      fs: "ext4",
    });
    expect(reg.getVolume(v.volumeId)).toEqual(v);
  });

  test("create rolls back registry entry on driver failure", async () => {
    const shell = new FakeShell();
    shell.setResponse("fallocate", { exitCode: 1, stdout: "", stderr: "no space" });
    const reg = makeRegistry(makeLoopback(shell));
    await expect(
      reg.createVolume({ tenantId: "t1", name: "x", sizeBytes: 100, fs: "ext4" }),
    ).rejects.toThrow("no space");
    expect(reg.listVolumes("t1").length).toBe(0);
  });

  test("delete removes the volume + invokes driver destroy", async () => {
    const shell = new FakeShell();
    const reg = makeRegistry(makeLoopback(shell));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "x",
      sizeBytes: 100,
      fs: "ext4",
    });
    await reg.deleteVolume(v.volumeId);
    expect(() => reg.getVolume(v.volumeId)).toThrow("not found");
    expect(shell.calls.some((c) => c.cmd === "rm")).toBe(true);
  });
});

// ── Attach/detach state machine ────────────────────────────────────

describe("attach/detach state machine", () => {
  test("attach moves available → attached and records ref", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 100,
      fs: "ext4",
    });
    const a = await reg.attachVolume(v.volumeId, {
      workerId: "worker-1",
      mountPath: "/mnt/data",
    });
    expect(a.status).toBe("attached");
    expect(a.attachedTo).toEqual({ workerId: "worker-1", mountPath: "/mnt/data" });
  });

  test("attach rejects when not available", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 100,
      fs: "ext4",
    });
    await reg.attachVolume(v.volumeId, { workerId: "w", mountPath: "/m" });
    await expect(
      reg.attachVolume(v.volumeId, { workerId: "w2", mountPath: "/m2" }),
    ).rejects.toThrow(/not available/);
  });

  test("attach rejects relative mount path", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 100,
      fs: "ext4",
    });
    await expect(
      reg.attachVolume(v.volumeId, { workerId: "w", mountPath: "data" }),
    ).rejects.toThrow(/absolute mountPath/);
  });

  test("detach moves attached → available", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 100,
      fs: "ext4",
    });
    await reg.attachVolume(v.volumeId, { workerId: "w", mountPath: "/m" });
    const d = await reg.detachVolume(v.volumeId);
    expect(d.status).toBe("available");
    expect(d.attachedTo).toBeNull();
  });

  test("detach on already-available volume errors", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 100,
      fs: "ext4",
    });
    await expect(reg.detachVolume(v.volumeId)).rejects.toThrow(/not attached/);
  });

  test("delete is blocked while attached", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 100,
      fs: "ext4",
    });
    await reg.attachVolume(v.volumeId, { workerId: "w", mountPath: "/m" });
    await expect(reg.deleteVolume(v.volumeId)).rejects.toThrow(/attached/);
  });
});

// ── Resize ─────────────────────────────────────────────────────────

describe("resize", () => {
  test("grows volume and tracks new size", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const r = await reg.resizeVolume(v.volumeId, 2_000);
    expect(r.sizeBytes).toBe(2_000);
  });

  test("rejects shrink", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 5_000,
      fs: "ext4",
    });
    await expect(reg.resizeVolume(v.volumeId, 1_000)).rejects.toThrow(/grow-only/);
  });

  test("no-op on equal size", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const r = await reg.resizeVolume(v.volumeId, 1_000);
    expect(r.sizeBytes).toBe(1_000);
  });

  test("rejects when delta exceeds quota", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()), 2_000);
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_500,
      fs: "ext4",
    });
    await expect(reg.resizeVolume(v.volumeId, 3_000)).rejects.toThrow(/quota/);
  });
});

// ── Quota ──────────────────────────────────────────────────────────

describe("quota", () => {
  test("create rejects when over quota", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()), 1_000);
    await reg.createVolume({ tenantId: "t1", name: "a", sizeBytes: 700, fs: "ext4" });
    await expect(
      reg.createVolume({ tenantId: "t1", name: "b", sizeBytes: 400, fs: "ext4" }),
    ).rejects.toMatchObject({ status: 422, code: "quota_exceeded" });
  });

  test("per-tenant override wins over default", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()), 1_000);
    reg.setQuota({ tenantId: "vip", maxBytes: 10_000 });
    const v = await reg.createVolume({
      tenantId: "vip",
      name: "big",
      sizeBytes: 5_000,
      fs: "ext4",
    });
    expect(v.sizeBytes).toBe(5_000);
  });

  test("usage excludes deleting volumes", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()), 1_000);
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "a",
      sizeBytes: 800,
      fs: "ext4",
    });
    await reg.deleteVolume(v.volumeId);
    expect(reg.usedBytes("t1")).toBe(0);
  });
});

// ── Snapshots ──────────────────────────────────────────────────────

describe("snapshots", () => {
  test("create snapshot of available volume", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const s = await reg.createSnapshot(v.volumeId);
    expect(s.volumeId).toBe(v.volumeId);
    expect(s.tenantId).toBe("t1");
    expect(s.sizeBytes).toBe(1_000);
    expect(s.sha256.length).toBe(64);
    expect(s.expiresAt).toBeNull();
  });

  test("snapshot of attached volume is allowed (online snapshot)", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    await reg.attachVolume(v.volumeId, { workerId: "w", mountPath: "/m" });
    const s = await reg.createSnapshot(v.volumeId);
    expect(s.snapshotId).toBeDefined();
  });

  test("ttlMs sets expiresAt", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const s = await reg.createSnapshot(v.volumeId, { ttlMs: 60_000 });
    expect(s.expiresAt).not.toBeNull();
  });

  test("restore into new volume with quota check", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()), 5_000);
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 2_000,
      fs: "ext4",
    });
    const s = await reg.createSnapshot(v.volumeId);
    const restored = await reg.restoreSnapshot(s.snapshotId, {
      newVolumeName: "from-snap",
    });
    expect(restored.tenantId).toBe("t1");
    expect(restored.sizeBytes).toBe(2_000);
    expect(restored.status).toBe("available");
    expect(restored.name).toBe("from-snap");
  });

  test("restore into existing volume requires available status", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const a = await reg.createVolume({
      tenantId: "t1",
      name: "a",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const b = await reg.createVolume({
      tenantId: "t1",
      name: "b",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const snap = await reg.createSnapshot(a.volumeId);
    await reg.attachVolume(b.volumeId, { workerId: "w", mountPath: "/m" });
    await expect(
      reg.restoreSnapshot(snap.snapshotId, { targetVolumeId: b.volumeId }),
    ).rejects.toThrow(/available/);
  });

  test("restore rejects target smaller than snapshot", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const a = await reg.createVolume({
      tenantId: "t1",
      name: "a",
      sizeBytes: 2_000,
      fs: "ext4",
    });
    const b = await reg.createVolume({
      tenantId: "t1",
      name: "b",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const snap = await reg.createSnapshot(a.volumeId);
    await expect(
      reg.restoreSnapshot(snap.snapshotId, { targetVolumeId: b.volumeId }),
    ).rejects.toThrow(/too_small|smaller/);
  });

  test("restore rejects cross-tenant target", async () => {
    const reg = makeRegistry(makeLoopback(new FakeShell()));
    const a = await reg.createVolume({
      tenantId: "t1",
      name: "a",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const b = await reg.createVolume({
      tenantId: "t2",
      name: "b",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const snap = await reg.createSnapshot(a.volumeId);
    await expect(
      reg.restoreSnapshot(snap.snapshotId, { targetVolumeId: b.volumeId }),
    ).rejects.toThrow(/tenant/);
  });
});

// ── Driver contract ────────────────────────────────────────────────

describe("driver interface contract", () => {
  test("LocalLoopbackDriver enforces ext4 only", async () => {
    const driver = makeLoopback(new FakeShell());
    await expect(
      driver.create({ volumeId: "x", sizeBytes: 100, fs: "nfs" }),
    ).rejects.toThrow(/ext4/);
  });

  test("NfsDriver enforces nfs only", async () => {
    const driver = makeNfs(new FakeShell());
    await expect(
      driver.create({ volumeId: "x", sizeBytes: 100, fs: "ext4" }),
    ).rejects.toThrow(/nfs/);
  });

  test("NfsDriver create produces nfs:// URI and tracks capacity", async () => {
    const shell = new FakeShell();
    const driver = makeNfs(shell);
    const handle = await driver.create({ volumeId: "v1", sizeBytes: 1_000, fs: "nfs" });
    expect(handle.uri.startsWith("nfs://")).toBe(true);
    expect(handle.capacityBytes).toBe(1_000);
    expect(shell.calls[0]?.cmd).toBe("mkdir");
  });

  test("registry works against NfsDriver end to end", async () => {
    const reg = makeRegistry(makeNfs(new FakeShell()));
    const v = await reg.createVolume({
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "nfs",
    });
    const s = await reg.createSnapshot(v.volumeId);
    const restored = await reg.restoreSnapshot(s.snapshotId, {});
    expect(restored.fs).toBe("nfs");
    expect(restored.status).toBe("available");
  });
});

// ── HTTP surface ───────────────────────────────────────────────────

function buildTestApp() {
  const driver = makeLoopback(new FakeShell());
  const built = buildApp({
    driver,
    authToken: "secret",
    defaultQuotaBytes: 10_000,
    registryOptions: { now: fixedClock(), generateId: counterIds() },
  });
  return built;
}

async function authedFetch(
  app: ReturnType<typeof buildTestApp>["app"],
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return app.fetch(
    new Request(`http://test${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

describe("HTTP surface", () => {
  test("rejects requests without bearer token", async () => {
    const { app } = buildTestApp();
    const res = await app.fetch(
      new Request("http://test/volumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: "t1",
          name: "x",
          sizeBytes: 100,
          fs: "ext4",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects requests with wrong bearer token", async () => {
    const { app } = buildTestApp();
    const res = await app.fetch(
      new Request("http://test/volumes/abc", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("health endpoint is unauthenticated", async () => {
    const { app } = buildTestApp();
    const res = await app.fetch(new Request("http://test/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("persistent-disks");
  });

  test("create + get + attach + detach + delete round trip", async () => {
    const { app } = buildTestApp();
    const create = await authedFetch(app, "POST", "/volumes", {
      tenantId: "t1",
      name: "data",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    expect(create.status).toBe(201);
    const v = (await create.json()) as { volumeId: string; status: string };
    expect(v.status).toBe("available");

    const got = await authedFetch(app, "GET", `/volumes/${v.volumeId}`);
    expect(got.status).toBe(200);

    const attach = await authedFetch(app, "POST", `/volumes/${v.volumeId}/attach`, {
      workerId: "w",
      mountPath: "/m",
    });
    expect(attach.status).toBe(200);
    expect(((await attach.json()) as { status: string }).status).toBe("attached");

    const delAttached = await authedFetch(app, "DELETE", `/volumes/${v.volumeId}`);
    expect(delAttached.status).toBe(409);

    const detach = await authedFetch(app, "POST", `/volumes/${v.volumeId}/detach`);
    expect(detach.status).toBe(200);

    const del = await authedFetch(app, "DELETE", `/volumes/${v.volumeId}`);
    expect(del.status).toBe(200);
  });

  test("create rejects invalid input with 400", async () => {
    const { app } = buildTestApp();
    const res = await authedFetch(app, "POST", "/volumes", {
      tenantId: "t1",
      name: "",
      sizeBytes: -1,
      fs: "btrfs",
    });
    expect(res.status).toBe(400);
  });

  test("quota exceeded surfaces as 422", async () => {
    const { app } = buildTestApp();
    await authedFetch(app, "POST", "/volumes", {
      tenantId: "tq",
      name: "a",
      sizeBytes: 8_000,
      fs: "ext4",
    });
    const res = await authedFetch(app, "POST", "/volumes", {
      tenantId: "tq",
      name: "b",
      sizeBytes: 5_000,
      fs: "ext4",
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("quota_exceeded");
  });

  test("snapshot create + restore via HTTP", async () => {
    const { app } = buildTestApp();
    const create = await authedFetch(app, "POST", "/volumes", {
      tenantId: "t1",
      name: "d",
      sizeBytes: 1_000,
      fs: "ext4",
    });
    const v = (await create.json()) as { volumeId: string };

    const snap = await authedFetch(app, "POST", `/volumes/${v.volumeId}/snapshots`);
    expect(snap.status).toBe(201);
    const s = (await snap.json()) as { snapshotId: string };

    const restored = await authedFetch(app, "POST", `/snapshots/${s.snapshotId}/restore`, {
      newVolumeName: "restored",
    });
    expect(restored.status).toBe(200);
    const rv = (await restored.json()) as { name: string; status: string };
    expect(rv.name).toBe("restored");
    expect(rv.status).toBe("available");
  });

  test("resize endpoint enforces grow-only via 400", async () => {
    const { app } = buildTestApp();
    const create = await authedFetch(app, "POST", "/volumes", {
      tenantId: "t1",
      name: "d",
      sizeBytes: 5_000,
      fs: "ext4",
    });
    const v = (await create.json()) as { volumeId: string };
    const shrink = await authedFetch(app, "POST", `/volumes/${v.volumeId}/resize`, {
      newSizeBytes: 1_000,
    });
    expect(shrink.status).toBe(400);
  });

  test("404 on unknown volume", async () => {
    const { app } = buildTestApp();
    const res = await authedFetch(app, "GET", "/volumes/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("buildApp throws without authToken", () => {
    const driver = makeLoopback(new FakeShell());
    expect(() => buildApp({ driver, authToken: "" })).toThrow();
  });
});
