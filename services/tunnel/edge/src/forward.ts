// ── Edge → origin request forwarding ───────────────────────────────
//
// Pure helper: take an inbound public Web `Request`, route it to the
// matching origin connection by `Host` header (or SNI), frame it, and
// await the correlated `ResponseFrame`. Returns a Web `Response`.
//
// 502 if no origin matches the hostname.
// 504 if the origin does not respond within `timeoutMs`.
// ─────────────────────────────────────────────────────────────────────

import {
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
  encodeFrame,
  generateRequestId,
} from "../../shared/frame";
import type { OriginRegistry } from "./registry";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface ForwardOptions {
  readonly timeoutMs?: number;
  /** Override hostname lookup (e.g. SNI from a TLS terminator). */
  readonly hostnameOverride?: string;
}

export async function forwardThroughOrigin(
  request: Request,
  registry: OriginRegistry,
  options: ForwardOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const hostname = options.hostnameOverride ?? request.headers.get("host") ?? url.host;
  const conn = registry.get(hostname);
  if (!conn) {
    return new Response(`no origin registered for ${hostname}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const id = generateRequestId();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const bodyBuf = new Uint8Array(await request.arrayBuffer());
  const frame: RequestFrame = {
    type: "request",
    id,
    hostname,
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    body: bodyToBase64(bodyBuf),
  };

  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const responsePromise = new Promise<ResponseFrame>((resolve, reject) => {
    registry.trackPending(id, { resolve, reject, connectionId: conn.id });
    const timer = setTimeout(() => {
      registry.rejectPending(id, new Error("origin response timeout"));
    }, timeoutMs);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      const maybeUnref = (timer as { unref?: () => void }).unref;
      if (typeof maybeUnref === "function") {
        maybeUnref.call(timer);
      }
    }
  });

  conn.send(encodeFrame(frame));

  try {
    const responseFrame = await responsePromise;
    return new Response(bodyFromBase64(responseFrame.body), {
      status: responseFrame.status,
      headers: responseFrame.headers,
    });
  } catch (err) {
    return new Response(`tunnel error: ${(err as Error).message}`, {
      status: 504,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
