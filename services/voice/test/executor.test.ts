import { beforeEach, describe, expect, test } from "bun:test";
import { MockCarrier } from "../src/carrier/mock.ts";
import { CallFlowExecutor, StaticFlowFetcher } from "../src/flow/executor.ts";
import {
  type CallRecord,
  type CrontechMLDoc,
  parseCrontechML,
} from "../src/flow/schema.ts";
import { CallStore } from "../src/store/store.ts";
import { MockAiAgentDispatcher } from "../src/ai-stream/types.ts";
import {
  MockRecordingStorage,
  MockTranscriptionClient,
} from "../src/recording/storage.ts";

interface Harness {
  carrier: MockCarrier;
  store: CallStore;
  ai: MockAiAgentDispatcher;
  storage: MockRecordingStorage;
  transcribe: MockTranscriptionClient;
  exec: (docs: Map<string, unknown>) => CallFlowExecutor;
  seedCall: (id: string, opts?: Partial<CallRecord>) => void;
}

function harness(): Harness {
  const carrier = new MockCarrier();
  const store = new CallStore();
  const ai = new MockAiAgentDispatcher();
  const storage = new MockRecordingStorage();
  const transcribe = new MockTranscriptionClient();
  return {
    carrier,
    store,
    ai,
    storage,
    transcribe,
    exec: (docs) =>
      new CallFlowExecutor({
        carrier,
        store,
        fetcher: new StaticFlowFetcher(docs),
        ai,
        storage,
        transcribe,
      }),
    seedCall: (id, opts = {}) => {
      const now = Date.now();
      store.insert({
        id,
        tenantId: "t1",
        from: "+15550000000",
        to: "+15551111111",
        direction: "outbound",
        state: "answered",
        createdAt: now,
        updatedAt: now,
        events: [],
        ...opts,
      });
    },
  };
}

describe("Executor — verb dispatch", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  test("say verb forwards text + voice to carrier", async () => {
    h.seedCall("c1");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "say", text: "hello", voice: "neural", language: "en-US" },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c1", doc);
    const sayEv = h.carrier.events.find((e) => e.op === "say");
    expect(sayEv?.detail?.["text"]).toBe("hello");
    expect(sayEv?.detail?.["voice"]).toBe("neural");
  });

  test("play verb loops audio", async () => {
    h.seedCall("c2");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "play", audioUrl: "https://cdn/h.mp3", loop: 3 },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c2", doc);
    const plays = h.carrier.events.filter((e) => e.op === "play");
    expect(plays).toHaveLength(3);
  });

  test("gather verb stores returned digits", async () => {
    h.seedCall("c3");
    h.carrier.digitResponses.set("c3", "1234#");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "gather", numDigits: 4, prompt: "enter pin" },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c3", doc);
    expect(h.store.get("c3")?.digits).toBe("1234#");
  });

  test("record verb stores URL and triggers transcription when requested", async () => {
    h.seedCall("c4");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "record", maxLengthSec: 30, transcribe: true },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c4", doc);
    const rec = h.store.get("c4");
    expect(rec?.recordingUrl).toBeDefined();
    expect(rec?.transcriptionText).toContain("mock transcription");
    expect(h.storage.uploads).toHaveLength(1);
    expect(h.transcribe.calls).toHaveLength(1);
  });

  test("dial verb performs carrier transfer", async () => {
    h.seedCall("c5");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "dial", to: "+15559999999" },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c5", doc);
    const t = h.carrier.events.find((e) => e.op === "transfer");
    expect(t?.detail?.["to"]).toBe("+15559999999");
  });

  test("hangup verb terminates and marks completed", async () => {
    h.seedCall("c6");
    const doc = parseCrontechML({
      version: "1",
      verbs: [{ verb: "hangup" }],
    });
    await h.exec(new Map()).run("c6", doc);
    expect(h.store.get("c6")?.state).toBe("completed");
    expect(h.carrier.events.some((e) => e.op === "hangup")).toBe(true);
  });

  test("connect_ai_agent dispatches via AI dispatcher", async () => {
    h.seedCall("c7");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        {
          verb: "connect_ai_agent",
          agentId: "support-bot",
          streamUrl: "wss://example/stream",
          systemPrompt: "be helpful",
        },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c7", doc);
    expect(h.ai.opened).toHaveLength(1);
    expect(h.ai.opened[0]?.agentId).toBe("support-bot");
    expect(
      h.store.get("c7")?.events.some((e) => e.type === "ai-agent-connected"),
    ).toBe(true);
  });

  test("redirect updates flowUrl for webhook continuation", async () => {
    h.seedCall("c8", { flowUrl: "https://orig/flow" });
    const next: CrontechMLDoc = {
      version: "1",
      verbs: [{ verb: "hangup" }],
    };
    const doc = parseCrontechML({
      version: "1",
      verbs: [{ verb: "redirect", url: "https://second/flow" }],
    });
    const docs = new Map<string, unknown>([["https://second/flow", next]]);
    await h.exec(docs).run("c8", doc);
    expect(h.store.get("c8")?.state).toBe("completed");
  });

  test("enqueue records event without terminating", async () => {
    h.seedCall("c9");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "enqueue", queueName: "support" },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c9", doc);
    const enq = h.store.get("c9")?.events.find((e) => e.type === "enqueued");
    expect(enq?.detail?.["queueName"]).toBe("support");
  });

  test("pause is non-terminal no-op", async () => {
    h.seedCall("c10");
    const doc = parseCrontechML({
      version: "1",
      verbs: [
        { verb: "pause", seconds: 1 },
        { verb: "hangup" },
      ],
    });
    await h.exec(new Map()).run("c10", doc);
    expect(h.store.get("c10")?.state).toBe("completed");
  });
});

describe("Executor — webhook continuation", () => {
  test("fetches next CrontechML when flowUrl is set", async () => {
    const h = harness();
    h.seedCall("c-cont", { flowUrl: "https://customer/next" });
    const docs = new Map<string, unknown>([
      [
        "https://customer/next",
        { version: "1", verbs: [{ verb: "hangup" }] },
      ],
    ]);
    const initial = parseCrontechML({
      version: "1",
      verbs: [{ verb: "say", text: "first" }],
    });
    await h.exec(docs).run("c-cont", initial);
    expect(h.store.get("c-cont")?.state).toBe("completed");
    expect(h.carrier.events.filter((e) => e.op === "say")).toHaveLength(1);
    expect(h.carrier.events.filter((e) => e.op === "hangup")).toHaveLength(1);
  });

  test("no flowUrl ends call cleanly", async () => {
    const h = harness();
    h.seedCall("c-end");
    const initial = parseCrontechML({
      version: "1",
      verbs: [{ verb: "say", text: "bye" }],
    });
    await h.exec(new Map()).run("c-end", initial);
    expect(h.store.get("c-end")?.state).toBe("completed");
  });
});
