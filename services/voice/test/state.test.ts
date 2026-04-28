import { describe, expect, test } from "bun:test";
import { CallStore, canTransition } from "../src/store/store.ts";

describe("Call state machine", () => {
  test("valid transitions", () => {
    expect(canTransition("queued", "dialing")).toBe(true);
    expect(canTransition("dialing", "ringing")).toBe(true);
    expect(canTransition("ringing", "answered")).toBe(true);
    expect(canTransition("answered", "in-progress")).toBe(true);
    expect(canTransition("in-progress", "completed")).toBe(true);
  });

  test("invalid transitions rejected", () => {
    expect(canTransition("completed", "ringing")).toBe(false);
    expect(canTransition("queued", "completed")).toBe(false);
    expect(canTransition("failed", "in-progress")).toBe(false);
  });

  test("terminal states are sinks", () => {
    for (const t of ["completed", "failed", "busy", "no-answer"] as const) {
      expect(canTransition(t, "in-progress")).toBe(false);
    }
  });

  test("store rejects duplicate insert", () => {
    const s = new CallStore();
    const now = Date.now();
    const rec = {
      id: "x",
      tenantId: "t",
      from: "+15550000000",
      to: "+15551111111",
      direction: "outbound" as const,
      state: "queued" as const,
      createdAt: now,
      updatedAt: now,
      events: [],
    };
    s.insert(rec);
    expect(() => s.insert(rec)).toThrow();
  });

  test("setState appends an event", () => {
    const s = new CallStore();
    const now = Date.now();
    s.insert({
      id: "y",
      tenantId: "t",
      from: "a",
      to: "b",
      direction: "outbound",
      state: "queued",
      createdAt: now,
      updatedAt: now,
      events: [],
    });
    s.setState("y", "dialing");
    expect(s.get("y")?.events.some((e) => e.type === "state:dialing")).toBe(true);
  });
});
