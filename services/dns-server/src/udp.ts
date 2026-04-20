// ── UDP listener for DNS queries (Bun.udpSocket) ─────────────────────
// DNS-over-UDP per RFC 1035 §4.2.1. Messages larger than 512 bytes are
// truncated and the TC bit is set so the client retries via TCP.
//
// The handler is fire-and-forget per datagram. We swallow parse errors
// and reply with FORMERR where possible; otherwise we drop the packet
// silently (DNS clients are expected to retry).

import { DNS_MAX_UDP_SIZE, RCode, decodeMessage, encodeMessage, buildResponse } from "./protocol";
import type { Resolver } from "./resolver";
import { ResponseCache } from "./cache";
import type { Metrics } from "./metrics";

export interface UdpListenerOptions {
  hostname: string;
  port: number;
  resolver: Resolver;
  metrics: Metrics;
  cache?: ResponseCache;
  /** Injected logger; defaults to console. */
  logger?: Pick<Console, "error" | "warn">;
}

export interface UdpListener {
  close(): void;
  readonly port: number;
  readonly hostname: string;
}

export async function startUdpListener(options: UdpListenerOptions): Promise<UdpListener> {
  const cache = options.cache ?? new ResponseCache();
  const logger = options.logger ?? console;

  const socket = await Bun.udpSocket({
    hostname: options.hostname,
    port: options.port,
    binaryType: "uint8array",
    socket: {
      async data(sock, data, port, address) {
        const started = performance.now();
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

        let request;
        try {
          request = decodeMessage(bytes);
        } catch (err) {
          options.metrics.recordError("decode");
          logger.warn(`[dns:udp] decode error from ${address}:${port}: ${(err as Error).message}`);
          // Without a parseable header we cannot echo an ID. Best effort:
          // try to reply with FORMERR using whatever ID bytes we have.
          if (bytes.length >= 2) {
            const id = (bytes[0]! << 8) | bytes[1]!;
            const errResp = encodeMessage({
              header: {
                id,
                qr: true,
                opcode: 0,
                aa: false,
                tc: false,
                rd: false,
                ra: false,
                z: 0,
                rcode: RCode.FORMERR,
                qdcount: 0,
                ancount: 0,
                nscount: 0,
                arcount: 0,
              },
              questions: [],
              answers: [],
              authorities: [],
              additionals: [],
            });
            sock.send(errResp, port, address);
          }
          return;
        }

        const question = request.questions[0];
        const cacheKey =
          question === undefined
            ? undefined
            : ResponseCache.key(question.name, question.type, question.class);

        // Cache path — serve the cached bytes with a fresh ID.
        if (question !== undefined && cacheKey !== undefined) {
          const cached = cache.get(cacheKey);
          if (cached !== undefined) {
            const rewritten = rewriteId(cached, request.header.id);
            const toSend = maybeTruncateForUdp(rewritten, request.header.id, request);
            sock.send(toSend, port, address);
            options.metrics.recordQuery(
              question.type,
              RCode.NOERROR,
              performance.now() - started,
              true,
            );
            return;
          }
        }

        try {
          const result = await options.resolver.resolve(request);
          const encoded = encodeMessage(result.response);
          const toSend = maybeTruncateForUdp(encoded, request.header.id, request);
          sock.send(toSend, port, address);

          if (cacheKey !== undefined && result.cacheable && result.minTtl > 0) {
            cache.set(cacheKey, encoded, result.minTtl);
          }

          options.metrics.recordQuery(
            question?.type ?? 0,
            result.rcode,
            performance.now() - started,
            false,
          );
        } catch (err) {
          options.metrics.recordError("resolve");
          logger.error(`[dns:udp] resolve error: ${(err as Error).message}`);
          const errResp = encodeMessage(
            buildResponse(request, { rcode: RCode.SERVFAIL, aa: false }),
          );
          sock.send(errResp, port, address);
        }
      },
      error(_sock, err) {
        options.metrics.recordError("socket");
        logger.error(`[dns:udp] socket error: ${err.message}`);
      },
    },
  });

  return {
    close: () => socket.close(),
    port: socket.port,
    hostname: socket.hostname,
  };
}

/**
 * Rewrite the ID field (first two bytes) on a cached response so that
 * it matches the new request's ID without re-encoding the full message.
 */
function rewriteId(bytes: Uint8Array, id: number): Uint8Array {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  out[0] = (id >> 8) & 0xff;
  out[1] = id & 0xff;
  return out;
}

/**
 * If the encoded response exceeds 512 bytes, UDP clients expect a
 * truncated reply with the TC bit set so they retry over TCP. We ship
 * an empty-answer response with TC=1 — much simpler and safer than
 * trying to trim RRs from a partially-encoded message.
 */
function maybeTruncateForUdp(
  encoded: Uint8Array,
  id: number,
  request: { header: { rd: boolean } } & Parameters<typeof buildResponse>[0],
): Uint8Array {
  if (encoded.length <= DNS_MAX_UDP_SIZE) return encoded;
  const truncated = buildResponse(request, { aa: true });
  truncated.header.id = id;
  truncated.header.tc = true;
  return encodeMessage(truncated);
}
