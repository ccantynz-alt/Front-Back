import { describe, expect, test } from "bun:test";
import { OriginRegistry, type OriginConnection } from "../src/registry";
import type { ResponseFrame } from "../../shared/frame";

interface CloseRecord {
  code?: number | undefined;
  reason?: string | undefined;
}

function makeConn(id: string, hostnames: string[]): {
  conn: OriginConnection;
  closed: CloseRecord | null;
  outbox: Uint8Array[];
} {
  const outbox: Uint8Array[] = [];
  let closed: CloseRecord | null = null;
  return {
    get closed() {
      return closed;
    },
    outbox,
    conn: {
      id,
      originId: `origin-${id}`,
      hostnames,
      send: (buf) => {
        outbox.push(buf);
      },
      close: (code, reason) => {
        closed = { code, reason };
      },
    },
  };
}

describe("edge/registry: lookup", () => {
  test("registers and looks up by hostname", () => {
    const r = new OriginRegistry();
    const a = makeConn("a", ["demo.crontech.app"]);
    r.register(a.conn);
    expect(r.get("demo.crontech.app")?.id).toBe("a");
    expect(r.hostnameCount()).toBe(1);
    expect(r.connectionCount()).toBe(1);
  });

  test("multi-hostname registration covers all advertised names", () => {
    const r = new OriginRegistry();
    const a = makeConn("a", ["a.example", "b.example", "c.example"]);
    r.register(a.conn);
    expect(r.get("a.example")?.id).toBe("a");
    expect(r.get("b.example")?.id).toBe("a");
    expect(r.get("c.example")?.id).toBe("a");
    expect(r.hostnameCount()).toBe(3);
    expect(r.connectionCount()).toBe(1);
  });

  test("displaces and closes a previous connection on the same hostname", () => {
    const r = new OriginRegistry();
    const a = makeConn("a", ["demo"]);
    const b = makeConn("b", ["demo"]);
    r.register(a.conn);
    r.register(b.conn);
    expect(a.closed).not.toBeNull();
    expect(r.get("demo")?.id).toBe("b");
  });

  test("unregister removes only the matching connection", () => {
    const r = new OriginRegistry();
    const a = makeConn("a", ["demo"]);
    const b = makeConn("b", ["demo"]);
    r.register(a.conn);
    r.unregister(b.conn); // stale unregister, no effect
    expect(r.get("demo")?.id).toBe("a");
    r.unregister(a.conn);
    expect(r.get("demo")).toBeUndefined();
    expect(r.hostnameCount()).toBe(0);
  });
});

describe("edge/registry: pending requests", () => {
  test("trackPending / resolvePending correlates by id", () => {
    const r = new OriginRegistry();
    const collected: ResponseFrame[] = [];
    r.trackPending("req-1", {
      resolve: (res) => collected.push(res),
      reject: () => undefined,
      connectionId: "conn-a",
    });
    expect(r.pendingCount()).toBe(1);
    const frame: ResponseFrame = {
      type: "response",
      id: "req-1",
      status: 200,
      headers: {},
      body: "",
    };
    expect(r.resolvePending("req-1", frame)).toBe(true);
    expect(collected).toHaveLength(1);
    expect(r.pendingCount()).toBe(0);
  });

  test("rejectPending fires the reject side", () => {
    const r = new OriginRegistry();
    const errors: Error[] = [];
    r.trackPending("req-2", {
      resolve: () => undefined,
      reject: (err) => errors.push(err),
      connectionId: "conn-a",
    });
    expect(r.rejectPending("req-2", new Error("boom"))).toBe(true);
    expect(errors[0]?.message).toBe("boom");
  });

  test("disconnecting an origin rejects its pending requests", () => {
    const r = new OriginRegistry();
    const a = makeConn("a", ["demo"]);
    r.register(a.conn);
    const errors: Error[] = [];
    r.trackPending("req-3", {
      resolve: () => undefined,
      reject: (err) => errors.push(err),
      connectionId: "a",
    });
    r.unregister(a.conn);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("connection closed");
    expect(r.pendingCount()).toBe(0);
  });
});
