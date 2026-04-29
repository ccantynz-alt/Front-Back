import { describe, expect, it } from "bun:test";

import {
  NeonProvisioner,
  type NeonTransport,
  type RedisCommand,
  RedisLocalProvisioner,
} from "../src/provisioners";

function makeNeonTransport(): {
  transport: NeonTransport;
  calls: Array<{ path: string; method: string; body?: unknown }>;
} {
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const transport: NeonTransport = async (path, init) => {
    calls.push({
      path,
      method: init.method,
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    if (path === "/projects" && init.method === "POST") {
      return {
        project_id: "proj_1",
        database: "main",
        role: "app",
        host: "neon.example.com",
        password: "secret-password",
      };
    }
    if (path.endsWith("/branches") && init.method === "POST") {
      return { branch_id: "br_1", host: "neon.example.com", password: "branch-pass" };
    }
    if (path.endsWith("/snapshots") && init.method === "POST") {
      return { snapshot_id: "s_1", size_bytes: 4096 };
    }
    if (path.endsWith("/credentials") && init.method === "POST") {
      return { password: "rotated-pass", host: "neon.example.com" };
    }
    if (init.method === "DELETE") {
      return { ok: true };
    }
    throw new Error(`unexpected ${init.method} ${path}`);
  };
  return { transport, calls };
}

describe("NeonProvisioner", () => {
  it("provisions a postgres project and returns a connection string", async () => {
    const { transport } = makeNeonTransport();
    const p = new NeonProvisioner({ transport });
    const out = await p.provision({
      dbId: "db1",
      tenantId: "t1",
      name: "App",
      region: "us-east-1",
      sizeTier: "starter",
    });
    expect(out.connectionString).toContain("postgres://app:secret-password@neon.example.com/main");
    expect(out.externalRefs["project_id"]).toBe("proj_1");
  });

  it("creates a branch via the Neon API", async () => {
    const { transport, calls } = makeNeonTransport();
    const p = new NeonProvisioner({ transport });
    const out = await p.branch({
      dbId: "db1",
      branchId: "b1",
      name: "feature",
      externalRefs: { project_id: "proj_1", role: "app", database: "main" },
    });
    expect(out.connectionString).toContain("branch-pass");
    expect(calls.some((c) => c.path === "/projects/proj_1/branches")).toBe(true);
  });

  it("snapshot returns size_bytes", async () => {
    const { transport } = makeNeonTransport();
    const p = new NeonProvisioner({ transport });
    const out = await p.snapshot({
      dbId: "db1",
      snapshotId: "snap-1",
      externalRefs: { project_id: "proj_1" },
    });
    expect(out.sizeBytes).toBe(4096);
  });

  it("rotate returns fresh password", async () => {
    const { transport } = makeNeonTransport();
    const p = new NeonProvisioner({ transport });
    const out = await p.rotate({
      dbId: "db1",
      externalRefs: { project_id: "proj_1", role: "app", database: "main" },
    });
    expect(out.connectionString).toContain("rotated-pass");
  });

  it("deprovision is a no-op when project_id missing", async () => {
    const { transport, calls } = makeNeonTransport();
    const p = new NeonProvisioner({ transport });
    await p.deprovision({ dbId: "db1", externalRefs: {} });
    expect(calls.length).toBe(0);
  });

  it("deprovision DELETEs the project", async () => {
    const { transport, calls } = makeNeonTransport();
    const p = new NeonProvisioner({ transport });
    await p.deprovision({ dbId: "db1", externalRefs: { project_id: "proj_1" } });
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/projects/proj_1")).toBe(true);
  });
});

describe("RedisLocalProvisioner", () => {
  function makeCommand(): { command: RedisCommand; calls: Array<{ cmd: string; args: string[] }> } {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const command: RedisCommand = async (cmd, args) => {
      calls.push({ cmd, args: [...args] });
      switch (cmd) {
        case "ACL_CREATE":
          return "redis-pass";
        case "ALLOC_DB":
          return "5";
        case "SNAPSHOT":
          return "2048";
        case "RESTORE":
          return "post-restore-pass";
        case "ACL_ROTATE":
          return "rotated-pass";
        default:
          return "ok";
      }
    };
    return { command, calls };
  }

  it("provisions a redis user + db index", async () => {
    const { command, calls } = makeCommand();
    const p = new RedisLocalProvisioner({ command, clusterHost: "rc.local", clusterPort: 6379 });
    const out = await p.provision({
      dbId: "db1",
      tenantId: "t1",
      name: "cache",
      region: "us-east-1",
      sizeTier: "starter",
    });
    expect(out.connectionString).toContain("redis://t-t1-db1:redis-pass@rc.local:6379/5");
    expect(calls.some((c) => c.cmd === "ACL_CREATE")).toBe(true);
    expect(calls.some((c) => c.cmd === "ALLOC_DB")).toBe(true);
  });

  it("rejects branch", async () => {
    const { command } = makeCommand();
    const p = new RedisLocalProvisioner({ command, clusterHost: "h", clusterPort: 6379 });
    await expect(
      p.branch({ dbId: "x", branchId: "y", name: "z", externalRefs: {} }),
    ).rejects.toThrow();
  });

  it("snapshot parses size", async () => {
    const { command } = makeCommand();
    const p = new RedisLocalProvisioner({ command, clusterHost: "h", clusterPort: 6379 });
    const snap = await p.snapshot({
      dbId: "db1",
      snapshotId: "s1",
      externalRefs: { db_index: "5" },
    });
    expect(snap.sizeBytes).toBe(2048);
  });

  it("rotate ACL", async () => {
    const { command } = makeCommand();
    const p = new RedisLocalProvisioner({ command, clusterHost: "h", clusterPort: 6379 });
    const out = await p.rotate({
      dbId: "db1",
      externalRefs: { user: "u", db_index: "5" },
    });
    expect(out.connectionString).toContain("rotated-pass");
  });

  it("deprovision releases user + db index", async () => {
    const { command, calls } = makeCommand();
    const p = new RedisLocalProvisioner({ command, clusterHost: "h", clusterPort: 6379 });
    await p.deprovision({ dbId: "db1", externalRefs: { user: "u", db_index: "5" } });
    expect(calls.some((c) => c.cmd === "ACL_DELETE")).toBe(true);
    expect(calls.some((c) => c.cmd === "FREE_DB")).toBe(true);
  });
});
