// ── Reverse-tunnel wire protocol (v1) ───────────────────────────────
//
// Every message that travels across the tunnel between an origin
// daemon and the edge daemon is a single binary frame:
//
//   ┌──────────────────┬──────────────────────────────────────────────┐
//   │ length (4 bytes) │ JSON payload (UTF-8, `length` bytes)         │
//   └──────────────────┴──────────────────────────────────────────────┘
//
// The 4-byte length prefix is big-endian unsigned. A frame whose payload
// length exceeds `MAX_FRAME_BYTES` is rejected.
//
// v1 introduces **control frames** alongside data frames. The full set:
//
//   - `request`   — inbound HTTP the edge wants the origin to serve
//   - `response`  — origin's HTTP reply, correlated by `id`
//   - `advertise` — origin announces which hostnames it serves
//   - `ping`      — health check (either side may send)
//   - `pong`      — health check ack (carries the ping id)
//   - `shutdown`  — graceful-shutdown notice (sender will close soon)
//
// All frames share an `id` field used for correlation. Frames are pure —
// encoding/decoding has no I/O, so the protocol is unit-tested
// exhaustively without binding sockets.
// ─────────────────────────────────────────────────────────────────────

export const MAX_FRAME_BYTES = 32 * 1024 * 1024; // 32 MiB hard ceiling
export const FRAME_HEADER_BYTES = 4;
export const PROTOCOL_VERSION = "v1" as const;

export interface RequestFrame {
  readonly type: "request";
  readonly id: string;
  readonly hostname: string;
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

export interface AdvertiseFrame {
  readonly type: "advertise";
  readonly id: string;
  readonly hostnames: readonly string[];
}

export interface PingFrame {
  readonly type: "ping";
  readonly id: string;
  readonly timestamp: number;
}

export interface PongFrame {
  readonly type: "pong";
  readonly id: string;
  readonly timestamp: number;
}

export interface ShutdownFrame {
  readonly type: "shutdown";
  readonly id: string;
  readonly reason: string;
}

export type Frame =
  | RequestFrame
  | ResponseFrame
  | AdvertiseFrame
  | PingFrame
  | PongFrame
  | ShutdownFrame;

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

// ── Encoders ────────────────────────────────────────────────────────

export function encodeFrame(frame: Frame): Uint8Array<ArrayBuffer> {
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

export const encodeRequest = (req: RequestFrame): Uint8Array<ArrayBuffer> =>
  encodeFrame(req);
export const encodeResponse = (res: ResponseFrame): Uint8Array<ArrayBuffer> =>
  encodeFrame(res);
export const encodeAdvertise = (
  ad: AdvertiseFrame,
): Uint8Array<ArrayBuffer> => encodeFrame(ad);
export const encodePing = (ping: PingFrame): Uint8Array<ArrayBuffer> =>
  encodeFrame(ping);
export const encodePong = (pong: PongFrame): Uint8Array<ArrayBuffer> =>
  encodeFrame(pong);
export const encodeShutdown = (
  s: ShutdownFrame,
): Uint8Array<ArrayBuffer> => encodeFrame(s);

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
    throw new FrameError(
      `declared length ${length}B exceeds max ${MAX_FRAME_BYTES}B`,
    );
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
  switch (type) {
    case "request":
      return assertRequestShape(candidate, id);
    case "response":
      return assertResponseShape(candidate, id);
    case "advertise":
      return assertAdvertiseShape(candidate, id);
    case "ping":
      return assertHealthShape(candidate, id, "ping");
    case "pong":
      return assertHealthShape(candidate, id, "pong");
    case "shutdown":
      return assertShutdownShape(candidate, id);
    default:
      throw new FrameError(`unknown frame type: ${String(type)}`);
  }
}

function assertRequestShape(
  candidate: Record<string, unknown>,
  id: string,
): RequestFrame {
  const hostname = candidate["hostname"];
  const method = candidate["method"];
  const url = candidate["url"];
  const body = candidate["body"];
  if (typeof hostname !== "string" || hostname.length === 0) {
    throw new FrameError("request.hostname must be a non-empty string");
  }
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
    hostname,
    method,
    url,
    headers: assertHeaderMap(candidate["headers"]),
    body,
  };
}

function assertResponseShape(
  candidate: Record<string, unknown>,
  id: string,
): ResponseFrame {
  const status = candidate["status"];
  const body = candidate["body"];
  if (
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    throw new FrameError("response.status must be an integer in [100, 599]");
  }
  if (typeof body !== "string") {
    throw new FrameError("response.body must be a string (base64)");
  }
  return {
    type: "response",
    id,
    status,
    headers: assertHeaderMap(candidate["headers"]),
    body,
  };
}

function assertAdvertiseShape(
  candidate: Record<string, unknown>,
  id: string,
): AdvertiseFrame {
  const hostnames = candidate["hostnames"];
  if (!Array.isArray(hostnames) || hostnames.length === 0) {
    throw new FrameError("advertise.hostnames must be a non-empty array");
  }
  const out: string[] = [];
  for (const entry of hostnames) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new FrameError(
        "advertise.hostnames entries must be non-empty strings",
      );
    }
    out.push(entry);
  }
  return { type: "advertise", id, hostnames: out };
}

function assertHealthShape(
  candidate: Record<string, unknown>,
  id: string,
  kind: "ping" | "pong",
): PingFrame | PongFrame {
  const timestamp = candidate["timestamp"];
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new FrameError(`${kind}.timestamp must be a finite number`);
  }
  return { type: kind, id, timestamp };
}

function assertShutdownShape(
  candidate: Record<string, unknown>,
  id: string,
): ShutdownFrame {
  const reason = candidate["reason"];
  if (typeof reason !== "string") {
    throw new FrameError("shutdown.reason must be a string");
  }
  return { type: "shutdown", id, reason };
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
  return base64UrlEncode(bytes);
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
 * zero-length Uint8Array.
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

/**
 * URL-safe base64 (no padding). Used by request id + signed tokens.
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}
