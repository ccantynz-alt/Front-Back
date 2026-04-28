// ── Wire-protocol framing tests (v1) ───────────────────────────────
//
// Covers: round-trip encoding for every v1 frame type, length-prefix
// correctness, decoder rejection of malformed inputs, header
// normalisation, body base64 round-trip, and request-id generator
// hygiene. No I/O.

import { describe, expect, test } from "bun:test";
import {
  type AdvertiseFrame,
  FRAME_HEADER_BYTES,
  FrameError,
  MAX_FRAME_BYTES,
  type PingFrame,
  type PongFrame,
  type RequestFrame,
  type ResponseFrame,
  type ShutdownFrame,
  bodyFromBase64,
  bodyToBase64,
  decodeFrame,
  decodeRequest,
  decodeResponse,
  encodeAdvertise,
  encodePing,
  encodePong,
  encodeRequest,
  encodeResponse,
  encodeShutdown,
  generateRequestId,
} from "../frame";

const sampleRequest: RequestFrame = {
  type: "request",
  id: "req-001",
  hostname: "demo.crontech.app",
  method: "POST",
  url: "/api/echo?hello=world",
  headers: { "content-type": "application/json", host: "demo.crontech.app" },
  body: bodyToBase64(new TextEncoder().encode('{"ping":true}')),
};

const sampleResponse: ResponseFrame = {
  type: "response",
  id: "req-001",
  status: 200,
  headers: { "content-type": "application/json" },
  body: bodyToBase64(new TextEncoder().encode('{"pong":true}')),
};

describe("frame: encoding (v1)", () => {
  test("round-trips request frame", () => {
    expect(decodeRequest(encodeRequest(sampleRequest))).toEqual(sampleRequest);
  });
  test("round-trips response frame", () => {
    expect(decodeResponse(encodeResponse(sampleResponse))).toEqual(sampleResponse);
  });
  test("round-trips advertise frame", () => {
    const frame: AdvertiseFrame = {
      type: "advertise",
      id: "tok-abc",
      hostnames: ["demo.crontech.app", "api.demo.crontech.app"],
    };
    const decoded = decodeFrame(encodeAdvertise(frame));
    expect(decoded).toEqual(frame);
  });
  test("round-trips ping/pong frames", () => {
    const ping: PingFrame = { type: "ping", id: "p-1", timestamp: 1234567890 };
    const pong: PongFrame = { type: "pong", id: "p-1", timestamp: 1234567899 };
    expect(decodeFrame(encodePing(ping))).toEqual(ping);
    expect(decodeFrame(encodePong(pong))).toEqual(pong);
  });
  test("round-trips shutdown frame", () => {
    const frame: ShutdownFrame = { type: "shutdown", id: "s-1", reason: "deploy" };
    expect(decodeFrame(encodeShutdown(frame))).toEqual(frame);
  });
  test("encodes a 4-byte big-endian length prefix", () => {
    const encoded = encodeRequest(sampleRequest);
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    expect(view.getUint32(0, false)).toBe(encoded.byteLength - FRAME_HEADER_BYTES);
  });
  test("oversize frames are rejected at encode time", () => {
    expect(MAX_FRAME_BYTES).toBeGreaterThan(0);
    const huge: RequestFrame = { ...sampleRequest, body: "x".repeat(MAX_FRAME_BYTES + 1) };
    expect(() => encodeRequest(huge)).toThrow(FrameError);
  });
});

describe("frame: decoder rejection", () => {
  test("rejects empty buffer", () => {
    expect(() => decodeFrame(new Uint8Array())).toThrow(FrameError);
  });
  test("rejects malformed JSON", () => {
    const payload = new TextEncoder().encode("{not-json}");
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });
  test("rejects unknown frame type", () => {
    const payload = new TextEncoder().encode(JSON.stringify({ type: "rogue", id: "x" }));
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });
  test("rejects advertise with empty hostnames", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "advertise", id: "x", hostnames: [] }),
    );
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });
});

describe("frame: body helpers", () => {
  test("bodyToBase64 round-trips", () => {
    const input = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(bodyFromBase64(bodyToBase64(input))).toEqual(input);
  });
  test("empty body maps to empty string", () => {
    expect(bodyToBase64(new Uint8Array())).toBe("");
    expect(bodyFromBase64("").byteLength).toBe(0);
  });
});

describe("frame: request id", () => {
  test("ids are url-safe and non-empty", () => {
    for (let i = 0; i < 10; i++) {
      const id = generateRequestId();
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/u);
    }
  });
  test("ids are unique across many invocations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateRequestId());
    }
    expect(seen.size).toBe(200);
  });
});
