import { describe, expect, test } from "bun:test";
import { MockCarrier } from "../src/carrier/mock.ts";
import { CallStore } from "../src/store/store.ts";
import { CallQuota } from "../src/quota/quota.ts";
import { StaticFlowFetcher } from "../src/flow/executor.ts";
import { VoiceApi } from "../src/rest/api.ts";
import { createHttpHandler } from "../src/rest/http.ts";
import { MockAiAgentDispatcher } from "../src/ai-stream/types.ts";
import {
  MockRecordingStorage,
  MockTranscriptionClient,
} from "../src/recording/storage.ts";

const TOKEN = "abc";

function buildHandler(
  docs: Map<string, unknown>,
  inbound: Map<string, { tenantId: string; flowUrl: string }>,
) {
  const carrier = new MockCarrier();
  const store = new CallStore();
  const quota = new CallQuota({ windowMs: 60_000, maxCallsPerWindow: 100 });
  const ai = new MockAiAgentDispatcher();
  const storage = new MockRecordingStorage();
  const transcribe = new MockTranscriptionClient();
  let counter = 0;
  const ids: string[] = [];
  const api = new VoiceApi({
    carrier,
    store,
    quota,
    fetcher: new StaticFlowFetcher(docs),
    ai,
    storage,
    transcribe,
    authToken: TOKEN,
    inboundFlowResolver: async (to) => inbound.get(to) ?? null,
    idGenerator: () => {
      counter += 1;
      const id = `c-${counter}`;
      ids.push(id);
      return id;
    },
  });
  return { handler: createHttpHandler(api), store, ids, carrier };
}

describe("HTTP adapter", () => {
  test("POST /v1/calls originates", async () => {
    const docs = new Map<string, unknown>([
      [
        "https://flow",
        { version: "1", verbs: [{ verb: "hangup" }] },
      ],
    ]);
    const { handler } = buildHandler(docs, new Map());
    const res = await handler(
      new Request("http://x/v1/calls", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          from: "+15550000001",
          to: "+15550000002",
          flowUrl: "https://flow",
          tenantId: "t",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { state: string };
    expect(j.state).toBe("completed");
  });

  test("GET unknown returns 404", async () => {
    const { handler } = buildHandler(new Map(), new Map());
    const res = await handler(
      new Request("http://x/v1/calls/nope", {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("Unknown route returns 404", async () => {
    const { handler } = buildHandler(new Map(), new Map());
    const res = await handler(new Request("http://x/whatever"));
    expect(res.status).toBe(404);
  });

  test("Inbound webhook routes through resolver", async () => {
    const docs = new Map<string, unknown>([
      [
        "https://inbound-flow",
        { version: "1", verbs: [{ verb: "hangup" }] },
      ],
    ]);
    const inbound = new Map([
      ["+15550000000", { tenantId: "tA", flowUrl: "https://inbound-flow" }],
    ]);
    const { handler } = buildHandler(docs, inbound);
    const res = await handler(
      new Request("http://x/v1/inbound", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          carrierCallId: "ext-1",
          from: "+15559990000",
          to: "+15550000000",
        }),
      }),
    );
    expect(res.status).toBe(200);
  });
});
