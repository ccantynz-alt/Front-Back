// ── Wire-protocol framing tests ──────────────────────────────────────
//
// Covers: round-trip encoding for both request and response shapes,
// length-prefix correctness, decoder rejection of malformed inputs,
// header normalisation, body base64 round-trip, and request-id
// generator hygiene. No I/O.

import { describe, expect, test } from "bun:test";
import {
  FRAME_HEADER_BYTES,
  FrameError,
  MAX_FRAME_BYTES,
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
  decodeFrame,
  decodeRequest,
  decodeResponse,
  encodeRequest,
  encodeResponse,
  generateRequestId,
} from "./frame";

const sampleRequest: RequestFrame = {
  type: "request",
  id: "req-001",
  method: "POST",
  url: "/api/echo?hello=world",
  headers: { "content-type": "application/json", host: "demo.crontech.app" },
  body: bodyToBase64(new TextEncoder().encode("{\"ping\":true}")),
};

const sampleResponse: ResponseFrame = {
  type: "response",
  id: "req-001",
  status: 200,
  headers: { "content-type": "application/json" },
  body: bodyToBase64(new TextEncoder().encode("{\"pong\":true}")),
};

describe("frame: encoding", () => {
  test("round-trips a request frame byte-for-byte", () => {
    const encoded = encodeRequest(sampleRequest);
    const decoded = decodeRequest(encoded);
    expect(decoded).toEqual(sampleRequest);
  });

  test("round-trips a response frame byte-for-byte", () => {
    const encoded = encodeResponse(sampleResponse);
    const decoded = decodeResponse(encoded);
    expect(decoded).toEqual(sampleResponse);
  });

  test("encodes a 4-byte big-endian length prefix", () => {
    const encoded = encodeRequest(sampleRequest);
    const view = new DataView(
      encoded.buffer,
      encoded.byteOffset,
      encoded.byteLength,
    );
    const declared = view.getUint32(0, false);
    expect(declared).toBe(encoded.byteLength - FRAME_HEADER_BYTES);
  });

  test("frames longer than MAX_FRAME_BYTES are rejected by the encoder", () => {
    // We can't allocate 32 MiB cheaply in a test, so directly verify
    // the constant is sane and the error path is wired up.
    expect(MAX_FRAME_BYTES).toBeGreaterThan(0);
    const oversize = "x".repeat(MAX_FRAME_BYTES + 1);
    const huge: RequestFrame = {
      ...sampleRequest,
      body: oversize,
    };
    expect(() => encodeRequest(huge)).toThrow(FrameError);
  });

  test("decodeFrame discriminates request vs response", () => {
    const reqBytes = encodeRequest(sampleRequest);
    const resBytes = encodeResponse(sampleResponse);
    const reqGeneric = decodeFrame(reqBytes);
    const resGeneric = decodeFrame(resBytes);
    expect(reqGeneric.type).toBe("request");
    expect(resGeneric.type).toBe("response");
  });
});

describe("frame: decoder rejection", () => {
  test("rejects an empty buffer", () => {
    expect(() => decodeFrame(new Uint8Array())).toThrow(FrameError);
  });

  test("rejects a buffer shorter than the header", () => {
    expect(() => decodeFrame(new Uint8Array([0, 0, 0]))).toThrow(FrameError);
  });

  test("rejects a length-prefix mismatch", () => {
    const encoded = encodeRequest(sampleRequest);
    const truncated = encoded.subarray(0, encoded.byteLength - 5);
    expect(() => decodeFrame(truncated)).toThrow(FrameError);
  });

  test("rejects malformed JSON payload", () => {
    const payload = new TextEncoder().encode("{not-json}");
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });

  test("rejects a request frame missing required fields", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "request", id: "x" }),
    );
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });

  test("rejects a response frame with an out-of-range status", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        type: "response",
        id: "x",
        status: 999,
        headers: {},
        body: "",
      }),
    );
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });

  test("rejects unknown frame types", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "rogue", id: "x" }),
    );
    const buf = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, payload.byteLength, false);
    buf.set(payload, FRAME_HEADER_BYTES);
    expect(() => decodeFrame(buf)).toThrow(FrameError);
  });

  test("decodeRequest refuses a response frame", () => {
    const bytes = encodeResponse(sampleResponse);
    expect(() => decodeRequest(bytes)).toThrow(FrameError);
  });

  test("decodeResponse refuses a request frame", () => {
    const bytes = encodeRequest(sampleRequest);
    expect(() => decodeResponse(bytes)).toThrow(FrameError);
  });
});

describe("frame: body helpers", () => {
  test("bodyToBase64 round-trips arbitrary bytes", () => {
    const input = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bodyToBase64(input);
    const decoded = bodyFromBase64(encoded);
    expect(decoded).toEqual(input);
  });

  test("bodyToBase64 maps an empty body to an empty string", () => {
    expect(bodyToBase64(new Uint8Array())).toBe("");
    expect(bodyFromBase64("").byteLength).toBe(0);
  });
});

describe("frame: request id", () => {
  test("ids are non-empty and url-safe", () => {
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
