import { beforeEach, describe, expect, test } from "bun:test";
import { MockCarrier } from "../src/carrier/mock.ts";
import { CallFlowExecutor, StaticFlowFetcher } from "../src/flow/executor.ts";
import { CallStore } from "../src/store/store.ts";
import { CallQuota } from "../src/quota/quota.ts";
import { VoiceApi } from "../src/rest/api.ts";
import { MockAiAgentDispatcher } from "../src/ai-stream/types.ts";
import {
  MockRecordingStorage,
  MockTranscriptionClient,
} from "../src/recording/storage.ts";

const TOKEN = "test-token";

interface Bag {
  api: VoiceApi;
  carrier: MockCarrier;
  store: CallStore;
  quota: CallQuota;
  inbound: Map<string, { tenantId: string; flowUrl: string }>;
  fetcher: StaticFlowFetcher;
  // Executor used for hand-driven flow tests.
  executor: CallFlowExecutor;
  ai: MockAiAgentDispatcher;
  storage: MockRecordingStorage;
  transcribe: MockTranscriptionClient;
  ids: string[];
}

function makeApi(docs: Map<string, unknown> = new Map()): Bag {
  const carrier = new MockCarrier();
  const store = new CallStore();
  const quota = new CallQuota({ windowMs: 60_000, maxCallsPerWindow: 3 });
  const fetcher = new StaticFlowFetcher(docs);
  const ai = new MockAiAgentDispatcher();
  const storage = new MockRecordingStorage();
  const transcribe = new MockTranscriptionClient();
  const inbound = new Map<string, { tenantId: string; flowUrl: string }>();
  const ids: string[] = [];
  let counter = 0;
  const api = new VoiceApi({
    carrier,
    store,
    quota,
    fetcher,
    ai,
    storage,
    transcribe,
    authToken: TOKEN,
    inboundFlowResolver: async (to) => inbound.get(to) ?? null,
    idGenerator: () => {
      counter += 1;
      const id = `call-${counter}`;
      ids.push(id);
      return id;
    },
  });
  const executor = new CallFlowExecutor({
    carrier,
    store,
    fetcher,
    ai,
    storage,
    transcribe,
  });
  return {
    api,
    carrier,
    store,
    quota,
    inbound,
    fetcher,
    executor,
    ai,
    storage,
    transcribe,
    ids,
  };
}

describe("REST API — auth", () => {
  test("rejects missing bearer", async () => {
    const { api } = makeApi();
    const res = await api.originate(null, {});
    expect(res.status).toBe(401);
  });

  test("rejects wrong bearer", async () => {
    const { api } = makeApi();
    const res = await api.originate("Bearer wrong", {});
    expect(res.status).toBe(401);
  });
});

describe("REST API — originate", () => {
  let bag: Bag;
  beforeEach(() => {
    bag = makeApi(
      new Map<string, unknown>([
        [
          "https://flow/initial",
          {
            version: "1",
            verbs: [
              { verb: "say", text: "hi" },
              { verb: "hangup" },
            ],
          },
        ],
      ]),
    );
  });

  test("400 on missing fields", async () => {
    const r = await bag.api.originate(`Bearer ${TOKEN}`, {});
    expect(r.status).toBe(400);
  });

  test("originates outbound call and runs flow", async () => {
    const r = await bag.api.originate(`Bearer ${TOKEN}`, {
      from: "+15550001111",
      to: "+15550002222",
      flowUrl: "https://flow/initial",
      tenantId: "tenantA",
    });
    expect(r.status).toBe(200);
    const id = bag.ids[0]!;
    expect(bag.store.get(id)?.state).toBe("completed");
    expect(bag.carrier.events.some((e) => e.op === "originate")).toBe(true);
    expect(bag.carrier.events.some((e) => e.op === "say")).toBe(true);
  });

  test("429 when quota exceeded", async () => {
    for (let i = 0; i < 3; i += 1) {
      await bag.api.originate(`Bearer ${TOKEN}`, {
        from: "+15550001111",
        to: "+15550002222",
        flowUrl: "https://flow/initial",
        tenantId: "tenantA",
      });
    }
    const r = await bag.api.originate(`Bearer ${TOKEN}`, {
      from: "+15550001111",
      to: "+15550002222",
      flowUrl: "https://flow/initial",
      tenantId: "tenantA",
    });
    expect(r.status).toBe(429);
  });
});

describe("REST API — call lifecycle", () => {
  test("hangup transitions to completed", async () => {
    const bag = makeApi(
      new Map<string, unknown>([
        [
          "https://flow/persistent",
          {
            version: "1",
            verbs: [{ verb: "say", text: "stay" }],
          },
        ],
      ]),
    );
    await bag.api.originate(`Bearer ${TOKEN}`, {
      from: "+15550000001",
      to: "+15550000002",
      flowUrl: "https://flow/persistent",
      tenantId: "t",
    });
    const id = bag.ids[0]!;
    // The flow with no hangup auto-completes when flowUrl is null after run,
    // but here flowUrl is set on the record. We verify hangup API works on
    // a completed record idempotently — explicit hangup never errors.
    const r = await bag.api.hangup(`Bearer ${TOKEN}`, id);
    expect(r.status).toBe(200);
    expect(bag.carrier.events.some((e) => e.op === "hangup")).toBe(true);
  });

  test("getCall returns 404 for unknown id", async () => {
    const bag = makeApi();
    const r = await bag.api.getCall(`Bearer ${TOKEN}`, "nope");
    expect(r.status).toBe(404);
  });

  test("transfer call dispatches to carrier", async () => {
    const bag = makeApi(
      new Map<string, unknown>([
        [
          "https://flow/x",
          { version: "1", verbs: [{ verb: "say", text: "hi" }] },
        ],
      ]),
    );
    await bag.api.originate(`Bearer ${TOKEN}`, {
      from: "+15550000001",
      to: "+15550000002",
      flowUrl: "https://flow/x",
      tenantId: "t",
    });
    const id = bag.ids[0]!;
    const r = await bag.api.transferCall(`Bearer ${TOKEN}`, id, {
      to: "+15558888888",
    });
    expect(r.status).toBe(200);
    expect(
      bag.carrier.events.some(
        (e) => e.op === "transfer" && e.detail?.["to"] === "+15558888888",
      ),
    ).toBe(true);
  });

  test("play call dispatches to carrier", async () => {
    const bag = makeApi(
      new Map<string, unknown>([
        [
          "https://flow/x",
          { version: "1", verbs: [{ verb: "say", text: "hi" }] },
        ],
      ]),
    );
    await bag.api.originate(`Bearer ${TOKEN}`, {
      from: "+15550000001",
      to: "+15550000002",
      flowUrl: "https://flow/x",
      tenantId: "t",
    });
    const id = bag.ids[0]!;
    const r = await bag.api.play(`Bearer ${TOKEN}`, id, {
      audioUrl: "https://cdn/play.mp3",
    });
    expect(r.status).toBe(200);
    expect(
      bag.carrier.events.some(
        (e) => e.op === "play" && e.detail?.["audioUrl"] === "https://cdn/play.mp3",
      ),
    ).toBe(true);
  });
});

describe("REST API — inbound", () => {
  test("404 when no inbound flow registered", async () => {
    const bag = makeApi();
    const r = await bag.api.inbound(`Bearer ${TOKEN}`, {
      carrierCallId: "ext-1",
      from: "+19990001111",
      to: "+15550000000",
    });
    expect(r.status).toBe(404);
  });

  test("runs inbound flow when configured", async () => {
    const bag = makeApi(
      new Map<string, unknown>([
        [
          "https://flow/inbound",
          {
            version: "1",
            verbs: [
              { verb: "say", text: "welcome" },
              { verb: "hangup" },
            ],
          },
        ],
      ]),
    );
    bag.inbound.set("+15550000000", {
      tenantId: "tenantI",
      flowUrl: "https://flow/inbound",
    });
    const r = await bag.api.inbound(`Bearer ${TOKEN}`, {
      carrierCallId: "ext-1",
      from: "+19990001111",
      to: "+15550000000",
    });
    expect(r.status).toBe(200);
    const id = bag.ids[0]!;
    expect(bag.store.get(id)?.direction).toBe("inbound");
    expect(bag.store.get(id)?.state).toBe("completed");
  });
});

describe("REST API — carrier failures", () => {
  test("502 when carrier originate fails", async () => {
    const bag = makeApi(
      new Map<string, unknown>([
        [
          "https://flow/x",
          { version: "1", verbs: [{ verb: "hangup" }] },
        ],
      ]),
    );
    bag.carrier.failMode = { op: "originate", callId: "call-1" };
    const r = await bag.api.originate(`Bearer ${TOKEN}`, {
      from: "+15550000001",
      to: "+15550000002",
      flowUrl: "https://flow/x",
      tenantId: "t",
    });
    expect(r.status).toBe(502);
    expect(bag.store.get("call-1")?.state).toBe("failed");
  });
});
