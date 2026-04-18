import { describe, expect, it } from "bun:test";
import { normalizeTranscript, parseJsonlLines } from "./parse";

describe("parseJsonlLines", () => {
  it("parses one object per line", () => {
    const raw =
      '{"a":1}\n{"b":2}\n{"c":3}';
    expect(parseJsonlLines(raw)).toHaveLength(3);
  });

  it("tolerates blank lines", () => {
    const raw = '\n{"a":1}\n\n{"b":2}\n';
    expect(parseJsonlLines(raw)).toHaveLength(2);
  });

  it("skips malformed lines without throwing", () => {
    const raw = '{"a":1}\nnot-json-at-all\n{"b":2}';
    expect(parseJsonlLines(raw)).toHaveLength(2);
  });
});

describe("normalizeTranscript", () => {
  it("returns null for empty input", () => {
    expect(normalizeTranscript([])).toBeNull();
  });

  it("extracts session id + user turn from a minimal transcript", () => {
    const raws = [
      {
        uuid: "u1",
        sessionId: "sess-1",
        timestamp: "2026-04-14T10:00:00Z",
        type: "user",
        cwd: "/home/user/Crontech",
        gitBranch: "main",
        message: { role: "user", content: "build the build runner" },
      },
      {
        uuid: "u2",
        sessionId: "sess-1",
        timestamp: "2026-04-14T10:00:05Z",
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "understood — starting now" }],
        },
      },
    ];

    const out = normalizeTranscript(raws);
    expect(out).not.toBeNull();
    expect(out?.session.id).toBe("sess-1");
    expect(out?.session.cwd).toBe("/home/user/Crontech");
    expect(out?.session.gitBranch).toBe("main");
    expect(out?.session.firstUserMessage).toBe("build the build runner");
    expect(out?.turns).toHaveLength(2);
    expect(out?.turns[0]?.role).toBe("user");
    expect(out?.turns[1]?.role).toBe("assistant");
  });

  it("classifies tool_use and tool_result roles", () => {
    const raws = [
      {
        uuid: "u1",
        sessionId: "sess-2",
        timestamp: "2026-04-14T10:00:00Z",
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "running a tool" },
            { type: "tool_use", name: "Read", input: {} },
          ],
        },
      },
      {
        uuid: "u2",
        sessionId: "sess-2",
        timestamp: "2026-04-14T10:00:01Z",
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "file contents" }],
        },
      },
    ];

    const out = normalizeTranscript(raws);
    expect(out?.turns[0]?.role).toBe("tool_use");
    expect(out?.turns[0]?.toolName).toBe("Read");
    expect(out?.turns[1]?.role).toBe("tool_result");
  });

  it("counts compact boundaries", () => {
    const raws = [
      {
        uuid: "u1",
        sessionId: "sess-3",
        timestamp: "2026-04-14T10:00:00Z",
        type: "user",
        message: { role: "user", content: "hello" },
      },
      {
        uuid: "u2",
        sessionId: "sess-3",
        timestamp: "2026-04-14T10:30:00Z",
        type: "system",
        subtype: "compact_boundary",
      },
    ];

    const out = normalizeTranscript(raws);
    expect(out?.session.compactCount).toBe(1);
  });

  it("redacts secrets inside content", () => {
    // Built at runtime so GitHub's secret scanner doesn't flag a literal
    // sk_live_... pattern in source. Still matches our redact regex.
    const fakeStripe = ["sk", "live", "AbCdEfGhIjKlMnOpQrStUvWx"].join("_");
    const raws = [
      {
        uuid: "u1",
        sessionId: "sess-4",
        timestamp: "2026-04-14T10:00:00Z",
        type: "user",
        message: { role: "user", content: `my key is ${fakeStripe}` },
      },
    ];
    const out = normalizeTranscript(raws);
    expect(out?.turns[0]?.content).toContain("[REDACTED:STRIPE_SECRET]");
    expect(out?.turns[0]?.content).not.toContain("AbCdEfGh");
  });
});
