// ── Edge → origin request forwarding ────────────────────────────────
//
// Pure (with respect to the registry) helper that takes an inbound
// Web `Request`, frames it, dispatches it through the matching origin
// connection, and awaits the response frame. Lives outside `edge.ts`
// so the runtime entrypoint stays thin and testable.
// ─────────────────────────────────────────────────────────────────────

import {
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
  encodeRequest,
  generateRequestId,
} from "./frame";
import { type OriginRegistry } from "./registry";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface ForwardOptions {
  readonly timeoutMs?: number;
}

/**
 * Forward an inbound HTTP request through the matching origin
 * connection and await the response frame. Returns a Web Response.
 *
 * - Looks up the origin by `Host` header (falls back to URL host).
 * - 502 if no origin is registered for that hostname.
 * - 504 if the origin does not respond within `timeoutMs`.
 * - Otherwise streams the framed response back as a Web Response.
 */
export async function forwardThroughOrigin(
  request: Request,
  registry: OriginRegistry,
  options: ForwardOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const conn = registry.get(host);
  if (!conn) {
    return new Response(`no origin registered for ${host}`, {
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
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    body: bodyToBase64(bodyBuf),
  };

  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const responsePromise = new Promise<ResponseFrame>((resolve, reject) => {
    registry.trackPending(id, { resolve, reject });
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

  conn.send(encodeRequest(frame));

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
