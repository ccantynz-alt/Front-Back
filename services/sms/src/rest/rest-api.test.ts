import { describe, expect, it } from "bun:test";
import { createHarness } from "../test-helpers.ts";

const TENANT = "tenant-rest";
const LONG = "+15551110000";

function bootstrap(h: ReturnType<typeof createHarness>): void {
  h.numbers.register({
    numberId: "rest-num",
    tenantId: TENANT,
    e164: LONG,
    capabilities: { sms: true, mms: true, voice: false },
    carrier: "twilio",
    type: "long-code",
  });
  h.a2p.registerBrand({
    brandId: "rest-brand",
    tenantId: TENANT,
    legalName: "Acme",
    ein: "11-2233445",
    vertical: "TECH",
  });
  h.a2p.approveCampaign({
    campaignId: "rest-camp",
    brandId: "rest-brand",
    tenantId: TENANT,
    useCase: "MARKETING",
    sampleMessages: ["Hi"],
  });
  h.numbers.attachA2p("rest-num", "rest-brand", "rest-camp");
}

function authedRequest(url: string, init: RequestInit & { token: string }): Request {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${init.token}`);
  if (!headers.has("content-type") && init.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(url, { ...init, headers });
}

describe("RestApi", () => {
  it("rejects unauthenticated requests", async () => {
    const h = createHarness();
    const res = await h.rest.handle(
      new Request("http://x/v1/messages", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects bad bearer tokens", async () => {
    const h = createHarness();
    const res = await h.rest.handle(
      authedRequest("http://x/v1/messages", {
        method: "POST",
        body: "{}",
        token: "wrong",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("sends a message via REST happy path", async () => {
    const h = createHarness();
    bootstrap(h);
    const res = await h.rest.handle(
      authedRequest("http://x/v1/messages", {
        method: "POST",
        token: h.bearerToken,
        body: JSON.stringify({
          from: LONG,
          to: "+15552220000",
          body: "REST hello",
          tenantId: TENANT,
        }),
      }),
    );
    expect(res.status).toBe(202);
    const json = (await res.json()) as { messageId: string; status: string };
    expect(json.status).toBe("queued");
    expect(typeof json.messageId).toBe("string");
  });

  it("validates body shape", async () => {
    const h = createHarness();
    bootstrap(h);
    const res = await h.rest.handle(
      authedRequest("http://x/v1/messages", {
        method: "POST",
        token: h.bearerToken,
        body: JSON.stringify({ to: "+15555550000" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown messageId", async () => {
    const h = createHarness();
    const res = await h.rest.handle(
      authedRequest("http://x/v1/messages/missing", {
        method: "GET",
        token: h.bearerToken,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("retrieves a sent message via GET", async () => {
    const h = createHarness();
    bootstrap(h);
    const sendRes = await h.rest.handle(
      authedRequest("http://x/v1/messages", {
        method: "POST",
        token: h.bearerToken,
        body: JSON.stringify({
          from: LONG,
          to: "+15552220000",
          body: "track",
          tenantId: TENANT,
        }),
      }),
    );
    const sendJson = (await sendRes.json()) as { messageId: string };
    const getRes = await h.rest.handle(
      authedRequest(`http://x/v1/messages/${sendJson.messageId}`, {
        method: "GET",
        token: h.bearerToken,
      }),
    );
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as { status: string; events: unknown[] };
    expect(getJson.status).toBe("sending");
    expect(Array.isArray(getJson.events)).toBe(true);
    expect(getJson.events.length).toBeGreaterThanOrEqual(2);
  });

  it("inbound endpoint validates carrier query param", async () => {
    const h = createHarness();
    const res = await h.rest.handle(
      new Request("http://x/v1/inbound", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(400);
  });

  it("inbound endpoint validates signature", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: LONG,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({ from: "+15553330000", to: LONG, body: "hi" });
    const res = await h.rest.handle(
      new Request("http://x/v1/inbound?carrier=twilio", {
        method: "POST",
        headers: { "X-Crontech-SMS-Signature": "bad" },
        body,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("inbound endpoint accepts valid signed payload", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: LONG,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({ from: "+15553330000", to: LONG, body: "hi" });
    const sig = h.twilio.signForTest(body);
    const res = await h.rest.handle(
      new Request("http://x/v1/inbound?carrier=twilio", {
        method: "POST",
        headers: { "X-Crontech-SMS-Signature": sig },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { tenantId: string };
    expect(json.tenantId).toBe(TENANT);
  });

  it("returns 404 for unknown route", async () => {
    const h = createHarness();
    const res = await h.rest.handle(new Request("http://x/v1/unknown", { method: "GET" }));
    expect(res.status).toBe(404);
  });

  it("returns 429 when rate limited", async () => {
    const h = createHarness();
    bootstrap(h);
    const first = await h.rest.handle(
      authedRequest("http://x/v1/messages", {
        method: "POST",
        token: h.bearerToken,
        body: JSON.stringify({
          from: LONG,
          to: "+15552220001",
          body: "1",
          tenantId: TENANT,
        }),
      }),
    );
    expect(first.status).toBe(202);
    const second = await h.rest.handle(
      authedRequest("http://x/v1/messages", {
        method: "POST",
        token: h.bearerToken,
        body: JSON.stringify({
          from: LONG,
          to: "+15552220002",
          body: "2",
          tenantId: TENANT,
        }),
      }),
    );
    expect(second.status).toBe(429);
  });
});
