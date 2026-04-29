// ── Origin-side request forwarder ──────────────────────────────────
//
// Pure helper that takes a decoded `RequestFrame`, forwards it to the
// matching local service via an injected `fetcher`, and returns a
// framed `ResponseFrame`. The fetcher injection is what lets us unit
// test multiplex fairness without binding sockets.
// ─────────────────────────────────────────────────────────────────────

import {
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
} from "../../shared/frame";
import { type RoutingConfig, buildLocalUrl, resolveLocalPort } from "./routing";

export type LocalFetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function forwardRequest(
  req: RequestFrame,
  routing: RoutingConfig,
  fetcher: LocalFetcher,
): Promise<ResponseFrame> {
  const port = resolveLocalPort(req.url, routing);
  const localUrl = buildLocalUrl(req, port);
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
  };
  if (req.body.length > 0 && !isBodylessMethod(req.method)) {
    init.body = bodyFromBase64(req.body);
  }
  const res = await fetcher(localUrl, init);
  const buf = new Uint8Array(await res.arrayBuffer());
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    type: "response",
    id: req.id,
    status: res.status,
    headers,
    body: bodyToBase64(buf),
  };
}

function isBodylessMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}
