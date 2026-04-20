// ── BLK-030 — Sinch client unit tests ─────────────────────────────────
// Focused checks for the pure helpers + HTTP surface of sinch-client.ts.
// The router-level tests (`trpc/procedures/sms.test.ts`) drive the
// integration path; this file covers the seams below it.

import { describe, test, expect } from "bun:test";
import {
  SinchClient,
  SinchError,
  isValidE164,
  segmentSms,
  applyMarkup,
  dollarsToMicrodollars,
  verifySinchSignature,
  markupPercentFromEnv,
} from "./sinch-client";

describe("isValidE164", () => {
  test("accepts well-formed E.164 numbers", () => {
    expect(isValidE164("+14155550123")).toBe(true);
    expect(isValidE164("+6421234567")).toBe(true);
    expect(isValidE164("+442079460958")).toBe(true);
  });

  test("rejects anything that is not E.164", () => {
    expect(isValidE164("14155550123")).toBe(false); // missing +
    expect(isValidE164("+04155550123")).toBe(false); // leading 0 after +
    expect(isValidE164("+1-415-555-0123")).toBe(false); // dashes
    expect(isValidE164("")).toBe(false);
    expect(isValidE164("+1")).toBe(false); // too short
    expect(isValidE164(`+${"9".repeat(16)}`)).toBe(false); // too long
  });
});

describe("segmentSms", () => {
  test("single-segment GSM-7 content stays 1 segment", () => {
    expect(segmentSms("Hello!").segments).toBe(1);
    expect(segmentSms("A".repeat(160)).segments).toBe(1);
  });

  test("GSM-7 body > 160 chars splits into concatenated 153-char parts", () => {
    expect(segmentSms("A".repeat(161)).segments).toBe(2);
    expect(segmentSms("A".repeat(306)).segments).toBe(2);
    expect(segmentSms("A".repeat(307)).segments).toBe(3);
  });

  test("extension-table chars count as two bytes in GSM-7", () => {
    // `{` is on the GSM-7 extension table — each one counts as 2.
    const body = `${"{".repeat(80)}`; // 80 × 2 = 160 encoded bytes — single seg.
    expect(segmentSms(body).encoding).toBe("gsm7");
    expect(segmentSms(body).segments).toBe(1);
  });

  test("non-GSM characters flip to UCS-2 with a 70-char single-seg limit", () => {
    expect(segmentSms("héllo 🌍").encoding).toBe("ucs2");
    expect(segmentSms("A".repeat(70) + "🌍").encoding).toBe("ucs2");
    expect(segmentSms("A".repeat(70) + "🌍").segments).toBeGreaterThanOrEqual(2);
  });
});

describe("applyMarkup", () => {
  test("rounds to nearest microdollar", () => {
    expect(applyMarkup(1, 30)).toEqual({
      retailMicrodollars: 1,
      markupMicrodollars: 0,
    });
    expect(applyMarkup(1_000_000, 30)).toEqual({
      retailMicrodollars: 1_300_000,
      markupMicrodollars: 300_000,
    });
    expect(applyMarkup(1_000_000, 25)).toEqual({
      retailMicrodollars: 1_250_000,
      markupMicrodollars: 250_000,
    });
  });
});

describe("dollarsToMicrodollars", () => {
  test("parses strings and numbers the same way", () => {
    expect(dollarsToMicrodollars("1.5")).toBe(1_500_000);
    expect(dollarsToMicrodollars(1.5)).toBe(1_500_000);
    expect(dollarsToMicrodollars("0")).toBe(0);
  });

  test("falls back to 0 for malformed input", () => {
    expect(dollarsToMicrodollars("not a number")).toBe(0);
    expect(dollarsToMicrodollars("-0.5")).toBe(0);
    expect(dollarsToMicrodollars(undefined)).toBe(0);
  });
});

describe("markupPercentFromEnv", () => {
  test("reads SMS_MARKUP_PERCENT when valid, otherwise defaults to 30", () => {
    const saved = process.env["SMS_MARKUP_PERCENT"];
    try {
      delete process.env["SMS_MARKUP_PERCENT"];
      expect(markupPercentFromEnv()).toBe(30);
      process.env["SMS_MARKUP_PERCENT"] = "50";
      expect(markupPercentFromEnv()).toBe(50);
      process.env["SMS_MARKUP_PERCENT"] = "not a number";
      expect(markupPercentFromEnv()).toBe(30);
    } finally {
      if (saved === undefined) delete process.env["SMS_MARKUP_PERCENT"];
      else process.env["SMS_MARKUP_PERCENT"] = saved;
    }
  });
});

describe("verifySinchSignature", () => {
  test("round-trips an HMAC-SHA256 signature", async () => {
    const { createHmac } = await import("node:crypto");
    const rawBody = JSON.stringify({ hello: "world" });
    const secret = "shh";
    const sig = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    expect(await verifySinchSignature({ rawBody, provided: sig, secret })).toBe(true);
    expect(
      await verifySinchSignature({ rawBody, provided: `sha256=${sig}`, secret }),
    ).toBe(true);
    expect(await verifySinchSignature({ rawBody, provided: "bogus", secret })).toBe(false);
    expect(await verifySinchSignature({ rawBody, provided: null, secret })).toBe(false);
    expect(await verifySinchSignature({ rawBody, provided: sig, secret: "" })).toBe(false);
  });
});

// We widen the fetch arg types here to avoid pulling in the Bun-specific
// `preconnect` slot the TS lib expects on the real `fetch`. The SinchClient
// only needs the call signature itself, so casting through `unknown` lets us
// keep TS strict + lint-green without a synthetic `preconnect` stub.
type FetchArgs = [input: string | URL | Request, init?: RequestInit];
type FetchLike = (...args: FetchArgs) => Promise<Response>;

function asFetch(impl: FetchLike): typeof fetch {
  return impl as unknown as typeof fetch;
}

describe("SinchClient.sendSms", () => {
  function buildClient(
    fetchImpl: FetchLike,
  ): { client: SinchClient; calls: Array<{ url: string; init: RequestInit }> } {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const wrapped: FetchLike = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      calls.push({ url, init: init ?? {} });
      return fetchImpl(input, init);
    };
    const client = new SinchClient(
      {
        servicePlanId: "plan-1",
        apiToken: "tok-1",
        baseUrl: "https://sinch.test/xms/v1",
      },
      { fetchImpl: asFetch(wrapped) },
    );
    return { client, calls };
  }

  test("POSTs to /batches with Bearer auth and parses the response via Zod", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          id: "batch-1",
          from: "+14155550100",
          to: ["+14155550199"],
          body: "hi",
          number_of_message_parts: 1,
          price_per_part: { amount: "0.01", currency: "USD" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    const { client, calls } = buildClient(fetchImpl);
    const res = await client.sendSms({
      from: "+14155550100",
      to: "+14155550199",
      body: "hi",
    });
    expect(res.id).toBe("batch-1");
    expect(res.number_of_message_parts).toBe(1);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.url).toBe("https://sinch.test/xms/v1/plan-1/batches");
    expect((call?.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-1",
    );
  });

  test("rejects non-E.164 input before issuing the HTTP call", async () => {
    const { client, calls } = buildClient(async () => new Response("{}"));
    let caught: unknown;
    try {
      await client.sendSms({ from: "+14155550100", to: "invalid", body: "hi" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SinchError);
    expect(calls).toHaveLength(0);
  });

  test("translates HTTP 5xx into a retryable SinchError", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ text: "carrier busy" }), { status: 503 });
    const { client } = buildClient(fetchImpl);
    let caught: SinchError | undefined;
    try {
      await client.sendSms({
        from: "+14155550100",
        to: "+14155550199",
        body: "hi",
      });
    } catch (err) {
      caught = err as SinchError;
    }
    expect(caught).toBeInstanceOf(SinchError);
    expect(caught?.status).toBe(503);
    expect(caught?.retryable).toBe(true);
  });

  test("translates HTTP 4xx into a non-retryable SinchError", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ text: "bad sender" }), { status: 400 });
    const { client } = buildClient(fetchImpl);
    let caught: SinchError | undefined;
    try {
      await client.sendSms({
        from: "+14155550100",
        to: "+14155550199",
        body: "hi",
      });
    } catch (err) {
      caught = err as SinchError;
    }
    expect(caught?.status).toBe(400);
    expect(caught?.retryable).toBe(false);
  });
});

describe("SinchClient.listMessages", () => {
  test("maps cursor + limit to Sinch page + page_size query params", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      calls.push(typeof input === "string" ? input : (input as URL).toString());
      return new Response(JSON.stringify({ count: 0, batches: [] }), {
        status: 200,
      });
    };
    const client = new SinchClient(
      {
        servicePlanId: "plan-1",
        apiToken: "tok-1",
        baseUrl: "https://sinch.test/xms/v1",
      },
      { fetchImpl: asFetch(fetchImpl) },
    );
    await client.listMessages({ cursor: "3", limit: 20 });
    expect(calls[0]).toBe(
      "https://sinch.test/xms/v1/plan-1/batches?page=3&page_size=20",
    );
  });
});
