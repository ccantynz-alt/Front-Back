import { describe, expect, it } from "bun:test";
import { AuditLogger } from "../src/audit";
import { parseMasterKey } from "../src/crypto";
import { VaultStore } from "../src/store";
import type { AuditEntry } from "../src/types";

const MASTER_HEX = "f".repeat(64);

function makeStore() {
  const masterKey = parseMasterKey(MASTER_HEX);
  const entries: AuditEntry[] = [];
  const audit = new AuditLogger({ sink: (e) => entries.push(e) });
  const store = new VaultStore({ masterKey, audit });
  return { store, entries };
}

describe("VaultStore.put + get", () => {
  it("round-trips a secret value", () => {
    const { store } = makeStore();
    store.put({ tenantId: "t1", key: "API_KEY", value: "sk-123", requesterId: "deployer" });
    const out = store.get({ tenantId: "t1", key: "API_KEY", requesterId: "deployer" });
    expect(out).toBe("sk-123");
  });

  it("returns null for missing keys", () => {
    const { store } = makeStore();
    const out = store.get({ tenantId: "t1", key: "MISSING", requesterId: "deployer" });
    expect(out).toBeNull();
  });

  it("isolates tenants — same key in two tenants stays separate", () => {
    const { store } = makeStore();
    store.put({ tenantId: "t1", key: "K", value: "v1", requesterId: "r" });
    store.put({ tenantId: "t2", key: "K", value: "v2", requesterId: "r" });
    expect(store.get({ tenantId: "t1", key: "K", requesterId: "r" })).toBe("v1");
    expect(store.get({ tenantId: "t2", key: "K", requesterId: "r" })).toBe("v2");
  });

  it("overwrite preserves createdAt and updates updatedAt", () => {
    let now = 1_000;
    const masterKey = parseMasterKey(MASTER_HEX);
    const store = new VaultStore({ masterKey, clock: () => now });
    const m1 = store.put({ tenantId: "t1", key: "K", value: "v1", requesterId: "r" });
    now = 2_000;
    const m2 = store.put({ tenantId: "t1", key: "K", value: "v2", requesterId: "r" });
    expect(m2.createdAt).toBe(m1.createdAt);
    expect(m2.updatedAt).not.toBe(m1.updatedAt);
  });
});

describe("VaultStore.list", () => {
  it("returns sorted keys without values", () => {
    const { store } = makeStore();
    store.put({ tenantId: "t1", key: "B", value: "vb", requesterId: "r" });
    store.put({ tenantId: "t1", key: "A", value: "va", requesterId: "r" });
    store.put({ tenantId: "t2", key: "C", value: "vc", requesterId: "r" });
    const keys = store.list({ tenantId: "t1", requesterId: "r" });
    expect(keys).toEqual(["A", "B"]);
  });

  it("never leaks values into the audit log", () => {
    const { store, entries } = makeStore();
    store.put({ tenantId: "t1", key: "SECRET_KEY", value: "ULTRA-SECRET-VALUE", requesterId: "r" });
    store.list({ tenantId: "t1", requesterId: "r" });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("ULTRA-SECRET-VALUE");
  });
});

describe("VaultStore.delete", () => {
  it("removes a stored secret", () => {
    const { store } = makeStore();
    store.put({ tenantId: "t1", key: "K", value: "v", requesterId: "r" });
    const removed = store.delete({ tenantId: "t1", key: "K", requesterId: "r" });
    expect(removed).toBe(true);
    expect(store.get({ tenantId: "t1", key: "K", requesterId: "r" })).toBeNull();
  });

  it("returns false when nothing to delete", () => {
    const { store } = makeStore();
    const removed = store.delete({ tenantId: "t1", key: "MISSING", requesterId: "r" });
    expect(removed).toBe(false);
  });
});

describe("VaultStore.bundle", () => {
  it("returns the requested subset only", () => {
    const { store } = makeStore();
    store.put({ tenantId: "t1", key: "DB_URL", value: "postgres://x", requesterId: "r" });
    store.put({ tenantId: "t1", key: "API_KEY", value: "sk-abc", requesterId: "r" });
    store.put({ tenantId: "t1", key: "UNUSED", value: "leaks", requesterId: "r" });
    const env = store.bundle({
      tenantId: "t1",
      keys: ["DB_URL", "API_KEY"],
      requesterId: "deployer",
    });
    expect(env).toEqual({ DB_URL: "postgres://x", API_KEY: "sk-abc" });
    expect(env).not.toHaveProperty("UNUSED");
  });

  it("omits missing keys silently", () => {
    const { store } = makeStore();
    store.put({ tenantId: "t1", key: "PRESENT", value: "yes", requesterId: "r" });
    const env = store.bundle({
      tenantId: "t1",
      keys: ["PRESENT", "MISSING"],
      requesterId: "deployer",
    });
    expect(env).toEqual({ PRESENT: "yes" });
  });

  it("audit log records BUNDLE action without leaking values", () => {
    const { store, entries } = makeStore();
    store.put({ tenantId: "t1", key: "K", value: "PLAINTEXT-LEAK-CHECK", requesterId: "r" });
    store.bundle({ tenantId: "t1", keys: ["K"], requesterId: "deployer" });
    const bundleEntries = entries.filter((e) => e.action === "BUNDLE");
    expect(bundleEntries.length).toBe(1);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("PLAINTEXT-LEAK-CHECK");
  });
});

describe("audit log shape", () => {
  it("each entry has the documented schema", () => {
    const { store, entries } = makeStore();
    store.put({ tenantId: "t1", key: "K", value: "v", requesterId: "r" });
    expect(entries.length).toBe(1);
    const entry = entries[0];
    if (!entry) throw new Error("missing entry");
    expect(entry.tenantId).toBe("t1");
    expect(entry.key).toBe("K");
    expect(entry.action).toBe("PUT");
    expect(entry.requesterId).toBe("r");
    expect(entry.result).toBe("ok");
    expect(typeof entry.timestamp).toBe("string");
    // ISO-8601
    expect(entry.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
