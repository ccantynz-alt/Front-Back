// ── TCP listener for DNS queries (Bun.listen) ───────────────────────
// DNS-over-TCP per RFC 1035 §4.2.2. Each message is preceded by a
// 2-byte big-endian length prefix. A single TCP connection may carry
// many back-to-back messages (pipelining); we parse as many as the
// buffer contains and keep the leftover for the next `data` callback.

import { RCode, buildResponse, decodeMessage, encodeMessage } from "./protocol";
import { ResponseCache } from "./cache";
import type { Resolver } from "./resolver";
import type { Metrics } from "./metrics";

export interface TcpListenerOptions {
  hostname: string;
  port: number;
  resolver: Resolver;
  metrics: Metrics;
  cache?: ResponseCache;
  logger?: Pick<Console, "error" | "warn">;
  /** Drop connection if this many bytes accumulate without a full message. */
  maxBufferBytes?: number;
}

interface ConnState {
  buffer: Uint8Array;
}

export interface TcpListener {
  stop(): void;
  readonly port: number;
  readonly hostname: string;
}

export function startTcpListener(options: TcpListenerOptions): TcpListener {
  const cache = options.cache ?? new ResponseCache();
  const logger = options.logger ?? console;
  const maxBuffer = options.maxBufferBytes ?? 64 * 1024;

  const listener = Bun.listen<ConnState>({
    hostname: options.hostname,
    port: options.port,
    socket: {
      open(socket) {
        socket.data = { buffer: new Uint8Array(0) };
      },
      async data(socket, chunk) {
        const existing = socket.data.buffer;
        const incoming = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        const merged = new Uint8Array(existing.length + incoming.length);
        merged.set(existing, 0);
        merged.set(incoming, existing.length);
        socket.data.buffer = merged;

        if (socket.data.buffer.length > maxBuffer) {
          options.metrics.recordError("tcp_buffer_overflow");
          logger.warn(`[dns:tcp] buffer overflow (${socket.data.buffer.length}b), closing`);
          socket.end();
          return;
        }

        while (true) {
          const buf = socket.data.buffer;
          if (buf.length < 2) return;
          const msgLen = (buf[0]! << 8) | buf[1]!;
          if (msgLen === 0) {
            // Protocol violation; drop the connection.
            options.metrics.recordError("tcp_zero_length");
            socket.end();
            return;
          }
          if (buf.length < 2 + msgLen) return;

          const msgBytes = buf.slice(2, 2 + msgLen);
          socket.data.buffer = buf.slice(2 + msgLen);

          await handleMessage(socket, msgBytes);
        }
      },
      error(_socket, err) {
        options.metrics.recordError("tcp_socket");
        logger.error(`[dns:tcp] socket error: ${err.message}`);
      },
    },
  });

  async function handleMessage(
    socket: { write(data: Uint8Array): number },
    bytes: Uint8Array,
  ): Promise<void> {
    const started = performance.now();
    let request;
    try {
      request = decodeMessage(bytes);
    } catch (err) {
      options.metrics.recordError("tcp_decode");
      logger.warn(`[dns:tcp] decode error: ${(err as Error).message}`);
      return;
    }

    const question = request.questions[0];
    const cacheKey =
      question === undefined
        ? undefined
        : ResponseCache.key(question.name, question.type, question.class);

    if (cacheKey !== undefined) {
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        const out = new Uint8Array(cached.length);
        out.set(cached);
        out[0] = (request.header.id >> 8) & 0xff;
        out[1] = request.header.id & 0xff;
        writeWithLengthPrefix(socket, out);
        options.metrics.recordQuery(
          question?.type ?? 0,
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
      writeWithLengthPrefix(socket, encoded);
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
      options.metrics.recordError("tcp_resolve");
      logger.error(`[dns:tcp] resolve error: ${(err as Error).message}`);
      const errResp = encodeMessage(buildResponse(request, { rcode: RCode.SERVFAIL, aa: false }));
      writeWithLengthPrefix(socket, errResp);
    }
  }

  return {
    stop: () => listener.stop(true),
    port: listener.port,
    hostname: listener.hostname,
  };
}

function writeWithLengthPrefix(
  socket: { write(data: Uint8Array): number },
  bytes: Uint8Array,
): void {
  const framed = new Uint8Array(2 + bytes.length);
  framed[0] = (bytes.length >> 8) & 0xff;
  framed[1] = bytes.length & 0xff;
  framed.set(bytes, 2);
  socket.write(framed);
}
