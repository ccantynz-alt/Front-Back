// ── Reverse-tunnel wire protocol ────────────────────────────────────
//
// Every message that travels across the WebSocket bridge between an
// origin daemon and the edge daemon is a single binary frame:
//
//   ┌──────────────────┬──────────────────────────────────────────────┐
//   │ length (4 bytes) │ JSON payload (UTF-8, `length` bytes)         │
//   └──────────────────┴──────────────────────────────────────────────┘
//
// The 4-byte length prefix is big-endian unsigned. A frame whose payload
// length exceeds `MAX_FRAME_BYTES` is rejected — a single tunnelled HTTP
// request body must not exceed that ceiling for v0. Multipart streaming
// is a v1 concern.
//
// The JSON payload is one of two discriminated shapes:
//
//   - `request`  — an inbound HTTP request the edge wants the origin
//                  to handle
//   - `response` — the origin's response, correlated by `id`
//
// Frames are pure — encoding/decoding has no I/O side effects, so the
// protocol can be unit-tested exhaustively without binding sockets.
// ─────────────────────────────────────────────────────────────────────

export const MAX_FRAME_BYTES = 32 * 1024 * 1024; // 32 MiB hard ceiling
export const FRAME_HEADER_BYTES = 4;

export interface RequestFrame {
  readonly type: "request";
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string; // base64-encoded body (empty string for none)
}

export interface ResponseFrame {
  readonly type: "response";
  readonly id: string;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string; // base64-encoded body (empty string for none)
}

export type Frame = RequestFrame | ResponseFrame;

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

// ── Encoders ────────────────────────────────────────────────────────

export function encodeRequest(req: RequestFrame): Uint8Array<ArrayBuffer> {
  return encodeFrame(req);
}

export function encodeResponse(res: ResponseFrame): Uint8Array<ArrayBuffer> {
  return encodeFrame(res);
}

function encodeFrame(frame: Frame): Uint8Array<ArrayBuffer> {
  const json = JSON.stringify(frame);
  const payload = new TextEncoder().encode(json);
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new FrameError(
      `frame payload ${payload.byteLength}B exceeds max ${MAX_FRAME_BYTES}B`,
    );
  }
  const buffer = new ArrayBuffer(FRAME_HEADER_BYTES + payload.byteLength);
  const out = new Uint8Array(buffer);
  const view = new DataView(buffer);
  view.setUint32(0, payload.byteLength, false);
  out.set(payload, FRAME_HEADER_BYTES);
  return out;
}

// ── Decoders ────────────────────────────────────────────────────────

export function decodeRequest(buf: Uint8Array): RequestFrame {
  const frame = decodeFrame(buf);
  if (frame.type !== "request") {
    throw new FrameError(`expected request frame, got ${frame.type}`);
  }
  return frame;
}

export function decodeResponse(buf: Uint8Array): ResponseFrame {
  const frame = decodeFrame(buf);
  if (frame.type !== "response") {
    throw new FrameError(`expected response frame, got ${frame.type}`);
  }
  return frame;
}

export function decodeFrame(buf: Uint8Array): Frame {
  if (buf.byteLength < FRAME_HEADER_BYTES) {
    throw new FrameError(
      `frame too short (${buf.byteLength}B < ${FRAME_HEADER_BYTES}B header)`,
    );
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const length = view.getUint32(0, false);
  if (length > MAX_FRAME_BYTES) {
    throw new FrameError(`declared length ${length}B exceeds max ${MAX_FRAME_BYTES}B`);
  }
  if (buf.byteLength !== FRAME_HEADER_BYTES + length) {
    throw new FrameError(
      `frame length mismatch: header says ${length}B, buffer carries ${buf.byteLength - FRAME_HEADER_BYTES}B`,
    );
  }
  const payload = buf.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + length);
  const json = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new FrameError(`malformed JSON: ${(err as Error).message}`);
  }
  return assertFrame(parsed);
}

function assertFrame(value: unknown): Frame {
  if (typeof value !== "object" || value === null) {
    throw new FrameError("frame payload is not an object");
  }
  const candidate = value as Record<string, unknown>;
  const type = candidate["type"];
  const id = candidate["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new FrameError("frame.id must be a non-empty string");
  }
  if (type === "request") {
    return assertRequestShape(candidate, id);
  }
  if (type === "response") {
    return assertResponseShape(candidate, id);
  }
  throw new FrameError(`unknown frame type: ${String(type)}`);
}

function assertRequestShape(candidate: Record<string, unknown>, id: string): RequestFrame {
  const method = candidate["method"];
  const url = candidate["url"];
  const headers = candidate["headers"];
  const body = candidate["body"];
  if (typeof method !== "string" || method.length === 0) {
    throw new FrameError("request.method must be a non-empty string");
  }
  if (typeof url !== "string" || url.length === 0) {
    throw new FrameError("request.url must be a non-empty string");
  }
  if (typeof body !== "string") {
    throw new FrameError("request.body must be a string (base64)");
  }
  return {
    type: "request",
    id,
    method,
    url,
    headers: assertHeaderMap(headers),
    body,
  };
}

function assertResponseShape(candidate: Record<string, unknown>, id: string): ResponseFrame {
  const status = candidate["status"];
  const headers = candidate["headers"];
  const body = candidate["body"];
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    throw new FrameError("response.status must be an integer in [100, 599]");
  }
  if (typeof body !== "string") {
    throw new FrameError("response.body must be a string (base64)");
  }
  return {
    type: "response",
    id,
    status,
    headers: assertHeaderMap(headers),
    body,
  };
}

function assertHeaderMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FrameError("headers must be an object");
  }
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val !== "string") {
      throw new FrameError(`header ${key} must be a string, got ${typeof val}`);
    }
    out[key] = val;
  }
  return out;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Generate a short, URL-safe correlation id. Used to pair an outbound
 * request frame with its eventual response. Not cryptographically
 * secret — collision resistance via 96 random bits is sufficient.
 */
export function generateRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // base64url, no padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

/**
 * Encode a binary HTTP body to base64. Empty bodies map to "".
 */
export function bodyToBase64(body: Uint8Array<ArrayBufferLike>): string {
  if (body.byteLength === 0) {
    return "";
  }
  let binary = "";
  for (let i = 0; i < body.byteLength; i++) {
    binary += String.fromCharCode(body[i] as number);
  }
  return btoa(binary);
}

/**
 * Decode a base64-encoded body back to bytes. Empty string maps to a
 * zero-length Uint8Array. Backed by a fresh ArrayBuffer so the result
 * is `Uint8Array<ArrayBuffer>` and acceptable to `BodyInit` /
 * `WebSocket.send`.
 */
export function bodyFromBase64(encoded: string): Uint8Array<ArrayBuffer> {
  if (encoded.length === 0) {
    return new Uint8Array(new ArrayBuffer(0));
  }
  const binary = atob(encoded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
