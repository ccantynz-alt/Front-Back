// Minimal DNS-over-UDP client for BLK-023 end-to-end tests.
//
// Hand-rolled on top of Bun.udpSocket + the engine's wire codec in
// @back-to-the-future/dns-server/protocol. No external DNS library — we want
// the test harness to exercise the exact same encode/decode path the server
// uses, so a protocol regression in one direction is caught immediately.
//
// Usage:
//   const client = await createDnsClient({ host: "127.0.0.1", port });
//   const response = await client.query({ name: "crontech.ai", type: RecordType.A });
//   // ...assertions on response.header / response.answers...
//   client.close();

import {
  type DnsMessage,
  type DnsQuestion,
  OpCode,
  RCode,
  type RecordClass,
  RecordType,
  decodeMessage,
  encodeMessage,
} from "@back-to-the-future/dns-server/protocol";

export interface DnsClientOptions {
  /** Server host to dial. Defaults to "127.0.0.1". */
  host?: string;
  /** Server UDP port. REQUIRED — ephemeral ports have no default. */
  port: number;
  /** Per-query timeout in milliseconds. Defaults to 2000. */
  timeoutMs?: number;
}

export interface DnsQueryOptions {
  name: string;
  type: RecordType;
  class?: RecordClass;
  /** Override the query transaction id. Defaults to a random u16. */
  id?: number;
  /** Set the Recursion Desired bit. Defaults to false (we're authoritative). */
  rd?: boolean;
}

export interface DnsClient {
  query(opts: DnsQueryOptions): Promise<DnsMessage>;
  close(): void;
}

interface PendingQuery {
  resolve(msg: DnsMessage): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Create a UDP DNS client bound to an ephemeral local port. The returned
 * handle multiplexes concurrent queries by transaction id, so tests can
 * fire several queries in parallel without collisions.
 */
export async function createDnsClient(options: DnsClientOptions): Promise<DnsClient> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port;
  const timeoutMs = options.timeoutMs ?? 2_000;

  const pending = new Map<number, PendingQuery>();

  // Bun.udpSocket returns a connected or connectionless socket. We use
  // connectionless mode (no `connect` option) and supply a destination on
  // each send so a single client can talk to multiple servers if needed.
  const socket = await Bun.udpSocket({
    port: 0,
    socket: {
      data(_sock, buf, _port, _addr): void {
        // Bun hands back a Buffer subclass of Uint8Array. Decode defensively.
        let msg: DnsMessage;
        try {
          const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
          msg = decodeMessage(view);
        } catch (err) {
          // Malformed response — can't match to a pending query. Surface to
          // every waiter so the test fails loudly rather than hanging.
          const error = err instanceof Error ? err : new Error(String(err));
          for (const p of pending.values()) {
            clearTimeout(p.timer);
            p.reject(error);
          }
          pending.clear();
          return;
        }

        const waiter = pending.get(msg.header.id);
        if (waiter === undefined) return; // Stale or unsolicited.
        pending.delete(msg.header.id);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      },
    },
  });

  function nextId(): number {
    // 16-bit transaction id. Avoid collisions with in-flight queries.
    for (let attempt = 0; attempt < 1024; attempt += 1) {
      const id = Math.floor(Math.random() * 0x10000);
      if (!pending.has(id)) return id;
    }
    throw new Error("dns-client: exhausted transaction id space");
  }

  return {
    query(opts: DnsQueryOptions): Promise<DnsMessage> {
      const id = opts.id ?? nextId();
      const question: DnsQuestion = {
        name: opts.name,
        type: opts.type,
        class: opts.class ?? (1 as RecordClass), // IN
      };
      const request: DnsMessage = {
        header: {
          id,
          qr: false,
          opcode: OpCode.QUERY,
          aa: false,
          tc: false,
          rd: opts.rd ?? false,
          ra: false,
          z: 0,
          rcode: RCode.NOERROR,
          qdcount: 1,
          ancount: 0,
          nscount: 0,
          arcount: 0,
        },
        questions: [question],
        answers: [],
        authorities: [],
        additionals: [],
      };

      const bytes = encodeMessage(request);

      return new Promise<DnsMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`dns-client: timeout after ${timeoutMs}ms for ${opts.name}`));
        }, timeoutMs);

        pending.set(id, { resolve, reject, timer });

        // Bun.udpSocket.send signature: (data, port, address).
        const sent = socket.send(bytes, port, host);
        if (sent === false) {
          pending.delete(id);
          clearTimeout(timer);
          reject(new Error(`dns-client: failed to send query to ${host}:${port}`));
        }
      });
    },

    close(): void {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("dns-client: closed before response"));
      }
      pending.clear();
      socket.close();
    },
  };
}
