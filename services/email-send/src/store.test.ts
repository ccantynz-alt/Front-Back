import { describe, expect, test } from "bun:test";
import { MessageStore } from "./store.ts";
import type { StoredMessage } from "./types.ts";

const makeStored = (overrides: Partial<StoredMessage> = {}): StoredMessage => ({
  id: "m1",
  tenantId: "t1",
  input: {
    from: "a@x.com",
    to: ["b@y.com"],
    subject: "hi",
    text: "body",
    tenantId: "t1",
  },
  status: "queued",
  createdAt: "2026-04-28T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:00.000Z",
  attempts: 0,
  events: [],
  ...overrides,
});

describe("MessageStore", () => {
  test("put + get", () => {
    const s = new MessageStore();
    s.put(makeStored());
    expect(s.get("m1")?.id).toBe("m1");
  });

  test("appendEvent stores and increments size", () => {
    const s = new MessageStore();
    s.put(makeStored());
    const evt = s.appendEvent("m1", "queued", "test");
    expect(evt?.type).toBe("queued");
    expect(s.get("m1")?.events.length).toBe(1);
  });

  test("setStatus updates status", () => {
    const s = new MessageStore();
    s.put(makeStored());
    s.setStatus("m1", "delivered");
    expect(s.get("m1")?.status).toBe("delivered");
  });

  test("incrementAttempts grows monotonically", () => {
    const s = new MessageStore();
    s.put(makeStored());
    expect(s.incrementAttempts("m1")).toBe(1);
    expect(s.incrementAttempts("m1")).toBe(2);
  });

  test("list filters by tenant", () => {
    const s = new MessageStore();
    s.put(makeStored({ id: "a", tenantId: "t1" }));
    s.put(makeStored({ id: "b", tenantId: "t2" }));
    expect(s.list("t1").length).toBe(1);
    expect(s.list("t1")[0]?.id).toBe("a");
  });
});
