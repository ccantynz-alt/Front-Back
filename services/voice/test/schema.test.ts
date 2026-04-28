import { describe, expect, test } from "bun:test";
import { parseCrontechML } from "../src/flow/schema.ts";

describe("CrontechML parser", () => {
  test("parses canonical IVR document", () => {
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "say", text: "Welcome to Crontech.", voice: "neural" },
        { verb: "gather", numDigits: 1, timeoutSec: 5, prompt: "Press 1 for sales." },
        { verb: "play", audioUrl: "https://cdn.example/hold.mp3", loop: 2 },
        { verb: "record", maxLengthSec: 60, transcribe: true },
        { verb: "dial", to: "+15555550100", record: true },
        { verb: "redirect", url: "https://customer.example/next.json" },
        { verb: "pause", seconds: 1 },
        { verb: "enqueue", queueName: "support" },
        {
          verb: "connect_ai_agent",
          agentId: "agent-42",
          streamUrl: "wss://comms.crontech/agents/42",
        },
        { verb: "hangup" },
      ],
    });
    expect(doc.verbs).toHaveLength(10);
    expect(doc.verbs[0]!.verb).toBe("say");
    expect(doc.verbs[9]!.verb).toBe("hangup");
  });

  test("rejects unknown verbs", () => {
    expect(() =>
      parseCrontechML({
        version: "1",
        verbs: [{ verb: "explode", payload: "boom" }],
      }),
    ).toThrow();
  });

  test("rejects empty verb list", () => {
    expect(() => parseCrontechML({ version: "1", verbs: [] })).toThrow();
  });

  test("rejects wrong version", () => {
    expect(() =>
      parseCrontechML({
        version: "2",
        verbs: [{ verb: "hangup" }],
      }),
    ).toThrow();
  });

  test("rejects non-URL audioUrl", () => {
    expect(() =>
      parseCrontechML({
        version: "1",
        verbs: [{ verb: "play", audioUrl: "not-a-url" }],
      }),
    ).toThrow();
  });

  test("rejects gather with too many digits", () => {
    expect(() =>
      parseCrontechML({
        version: "1",
        verbs: [{ verb: "gather", numDigits: 999 }],
      }),
    ).toThrow();
  });
});
