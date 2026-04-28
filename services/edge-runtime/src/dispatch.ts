// ── Crontech Edge Runtime — Dispatch Helpers ────────────────────────
// Pure functions used by the HTTP layer to talk to a Bun Worker:
//   * serialiseRequest    — turn a Web `Request` into a structured-clone-
//                           safe payload the worker can rebuild.
//   * deserialiseResponse — turn the worker's reply payload back into a
//                           Web `Response` the HTTP layer can stream out.
//   * computeBundleHash   — stable SHA-256 over (id, entrypoint, code)
//                           used as the bundle fingerprint.
//
// No Bun-Worker-specific code lives here. These helpers are pure data
// transforms so they are trivially testable without spawning a worker.

import { createHash } from "node:crypto";
import { z } from "zod";

// ── Wire schemas ────────────────────────────────────────────────────

export const SerialisedRequestSchema = z.object({
  method: z.string().min(1),
  url: z.string().url(),
  /** Header keys are normalised to lowercase. */
  headers: z.array(z.tuple([z.string(), z.string()])),
  /** Base64-encoded body bytes; empty string if no body. */
  bodyBase64: z.string(),
});

export type SerialisedRequest = z.infer<typeof SerialisedRequestSchema>;

export const SerialisedResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  statusText: z.string(),
  headers: z.array(z.tuple([z.string(), z.string()])),
  bodyBase64: z.string(),
});

export type SerialisedResponse = z.infer<typeof SerialisedResponseSchema>;

export const WorkerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("invoke"),
    request: SerialisedRequestSchema,
  }),
  z.object({
    type: z.literal("init"),
    code: z.string(),
    entrypoint: z.string(),
  }),
]);

export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;

export const WorkerReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("response"), response: SerialisedResponseSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type WorkerReply = z.infer<typeof WorkerReplySchema>;

// ── Encoding helpers ────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  // Buffer is the cheapest base64 encoder in Bun and Node.
  return Buffer.from(bytes).toString("base64");
}

/**
 * Decode a base64 string into a fresh, owned `ArrayBuffer`. Avoids the
 * `SharedArrayBuffer` ambiguity that TypeScript flags when handing
 * `Uint8Array.buffer` straight to `BodyInit`.
 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const src = Buffer.from(b64, "base64");
  const out = new ArrayBuffer(src.byteLength);
  new Uint8Array(out).set(src);
  return out;
}

function headersToTuples(headers: Headers): [string, string][] {
  const out: [string, string][] = [];
  headers.forEach((value, key) => {
    out.push([key.toLowerCase(), value]);
  });
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

// ── Request serialisation ───────────────────────────────────────────

export async function serialiseRequest(req: Request): Promise<SerialisedRequest> {
  const buf = await req.arrayBuffer();
  return {
    method: req.method,
    url: req.url,
    headers: headersToTuples(req.headers),
    bodyBase64: buf.byteLength === 0 ? "" : bytesToBase64(new Uint8Array(buf)),
  };
}

export function deserialiseRequest(payload: SerialisedRequest): Request {
  const headers = new Headers();
  for (const [k, v] of payload.headers) headers.append(k, v);
  const hasBody =
    payload.bodyBase64.length > 0 && payload.method !== "GET" && payload.method !== "HEAD";
  const init: RequestInit = { method: payload.method, headers };
  if (hasBody) {
    init.body = base64ToArrayBuffer(payload.bodyBase64);
  }
  return new Request(payload.url, init);
}

// ── Response serialisation ──────────────────────────────────────────

export async function serialiseResponse(res: Response): Promise<SerialisedResponse> {
  const buf = await res.arrayBuffer();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: headersToTuples(res.headers),
    bodyBase64: buf.byteLength === 0 ? "" : bytesToBase64(new Uint8Array(buf)),
  };
}

export function deserialiseResponse(payload: SerialisedResponse): Response {
  const headers = new Headers();
  for (const [k, v] of payload.headers) headers.append(k, v);
  const body = payload.bodyBase64.length === 0 ? null : base64ToArrayBuffer(payload.bodyBase64);
  return new Response(body, {
    status: payload.status,
    statusText: payload.statusText,
    headers,
  });
}

// ── Bundle hashing ──────────────────────────────────────────────────

/**
 * Stable content hash for a bundle. Inputs are length-prefixed so the
 * three fields cannot collide via concatenation (e.g. an attacker
 * cannot craft `entrypoint = "x"` + `code = "..."` to match a different
 * `entrypoint = "x..."` pair).
 */
export function computeBundleHash(input: {
  id: string;
  entrypoint: string;
  code: string;
}): string {
  const h = createHash("sha256");
  const parts: [string, string][] = [
    ["id", input.id],
    ["entrypoint", input.entrypoint],
    ["code", input.code],
  ];
  for (const [k, v] of parts) {
    const valueBytes = Buffer.byteLength(v, "utf8");
    h.update(`${k}:${valueBytes}:`);
    h.update(v, "utf8");
    h.update(":");
  }
  return h.digest("hex");
}
