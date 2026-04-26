/**
 * AI Gateway v1 — failover + cost-calculation coverage.
 * Auth, payload validation, happy-path, and cache cases live in
 * `index.test.ts`; this file isolates the more involved scenarios so
 * each test file stays under the codeQuality file-length cap.
 */

import { describe, expect, test } from "bun:test";
import { estimateCost } from "@back-to-the-future/ai-core";
import {
  GatewayUpstreamError,
  createAiGatewayApp,
  type ChatCompletionResponse,
  type ProviderCaller,
} from "./index";
import {
  ANTHROPIC_MODEL,
  BEARER,
  OPENAI_MODEL,
  happy,
  makeRequest,
  recordingCaller,
  validBody,
} from "./test-helpers";

describe("AI Gateway — failover", () => {
  test("primary 503 falls back to secondary provider and returns its response", async () => {
    let invocations = 0;
    const caller: ProviderCaller = async (input) => {
      invocations++;
      if (input.provider === "anthropic") {
        throw new GatewayUpstreamError(503, "anthropic 503: overloaded");
      }
      return happy({ content: "from openai", promptTokens: 5, completionTokens: 3 });
    };

    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatCompletionResponse;
    expect(body.crontech.provider).toBe("openai");
    expect(body.crontech.failover).toBe(true);
    expect(body.choices[0]?.message.content).toBe("from openai");
    expect(invocations).toBe(2);
  });

  test("non-5xx errors do NOT trigger failover (e.g. 401 invalid key)", async () => {
    let invocations = 0;
    const caller: ProviderCaller = async () => {
      invocations++;
      throw new GatewayUpstreamError(401, "anthropic 401: unauthorized");
    };
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(res.status).toBe(401);
    expect(invocations).toBe(1);
  });

  test("502 returned when both providers fail with 5xx", async () => {
    const caller: ProviderCaller = async (input) => {
      throw new GatewayUpstreamError(503, `${input.provider} 503: down`);
    };
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("upstream_error");
  });

  test("AbortError (timeout) is treated as failoverable", async () => {
    let invocations = 0;
    const caller: ProviderCaller = async (input) => {
      invocations++;
      if (input.provider === "anthropic") {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return happy({ content: "recovered", promptTokens: 1, completionTokens: 1 });
    };
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(res.status).toBe(200);
    expect(invocations).toBe(2);
    const body = (await res.json()) as ChatCompletionResponse;
    expect(body.crontech.failover).toBe(true);
  });
});

describe("AI Gateway — cost calculation", () => {
  test("cost_usd_micros matches estimateCost for the chosen model", async () => {
    const { caller } = recordingCaller(() =>
      happy({ promptTokens: 1_000_000, completionTokens: 500_000 }),
    );
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ChatCompletionResponse;
    const expected = estimateCost(ANTHROPIC_MODEL, 1_000_000, 500_000);
    expect(body.crontech.cost_usd_micros).toBe(expected);
    // claude-sonnet-4-6 is $3 in / $15 out per 1M tokens → $3 + $7.5 = $10.50.
    // estimateCost returns micros: 10_500_000.
    expect(expected).toBe(10_500_000);
  });

  test("unknown models report cost 0 (estimateCost contract)", async () => {
    const { caller } = recordingCaller(() => happy({ promptTokens: 100, completionTokens: 50 }));
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(
      makeRequest(validBody({ model: OPENAI_MODEL }), { auth: `Bearer ${BEARER}` }),
    );
    const body = (await res.json()) as ChatCompletionResponse;
    expect(body.crontech.cost_usd_micros).toBe(0);
  });
});
