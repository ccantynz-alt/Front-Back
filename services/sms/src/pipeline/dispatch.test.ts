import { describe, expect, it } from "bun:test";
import { createHarness } from "../test-helpers.ts";

const TENANT = "tenant-acme";
const LONG_CODE = "+15551234567";
const SHORT_CODE = "12345";
const TOLL_FREE = "+18885550100";

function registerLongCodeWithA2p(harness: ReturnType<typeof createHarness>): void {
  harness.numbers.register({
    numberId: "num-long",
    tenantId: TENANT,
    e164: LONG_CODE,
    capabilities: { sms: true, mms: true, voice: false },
    carrier: "twilio",
    type: "long-code",
  });
  harness.a2p.registerBrand({
    brandId: "brand-1",
    tenantId: TENANT,
    legalName: "Acme Inc",
    ein: "12-3456789",
    vertical: "TECHNOLOGY",
  });
  harness.a2p.approveCampaign({
    campaignId: "camp-1",
    brandId: "brand-1",
    tenantId: TENANT,
    useCase: "MARKETING",
    sampleMessages: ["Hello from Acme!"],
  });
  harness.numbers.attachA2p("num-long", "brand-1", "camp-1");
}

describe("DispatchPipeline", () => {
  it("sends a happy-path SMS via the carrier", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const result = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "hello",
      tenantId: TENANT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("sending");
    const stored = h.store.get(result.messageId);
    expect(stored).toBeDefined();
    expect(stored?.events.length).toBe(2);
    expect(stored?.events[0]?.status).toBe("queued");
    expect(stored?.events[1]?.status).toBe("sending");
    expect(h.twilio.sent.length).toBe(1);
    expect(h.twilio.sent[0]?.body).toBe("hello");
  });

  it("sends an MMS with media URLs when the number has MMS capability", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const result = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "see attached",
      mediaUrls: ["https://cdn.example.com/img.png"],
      tenantId: TENANT,
    });
    expect(result.ok).toBe(true);
    expect(h.twilio.sent[0]?.mediaUrls).toEqual(["https://cdn.example.com/img.png"]);
  });

  it("rejects MMS when from-number lacks MMS capability", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "num-sms-only",
      tenantId: TENANT,
      e164: SHORT_CODE,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "short-code",
    });
    const result = await h.pipeline.send({
      from: SHORT_CODE,
      to: "+15555550000",
      body: "no mms",
      mediaUrls: ["https://cdn.example.com/img.png"],
      tenantId: TENANT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("missing_mms_capability");
  });

  it("blocks long-code SMS without A2P 10DLC campaign", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "num-long-bare",
      tenantId: TENANT,
      e164: LONG_CODE,
      capabilities: { sms: true, mms: true, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const result = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "hi",
      tenantId: TENANT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("a2p_violation");
  });

  it("allows short-code SMS without A2P 10DLC", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "num-short",
      tenantId: TENANT,
      e164: SHORT_CODE,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "short-code",
    });
    const result = await h.pipeline.send({
      from: SHORT_CODE,
      to: "+15555550000",
      body: "hi",
      tenantId: TENANT,
    });
    expect(result.ok).toBe(true);
  });

  it("allows toll-free without A2P", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "num-tf",
      tenantId: TENANT,
      e164: TOLL_FREE,
      capabilities: { sms: true, mms: true, voice: true },
      carrier: "bandwidth",
      type: "toll-free",
    });
    const result = await h.pipeline.send({
      from: TOLL_FREE,
      to: "+15555550000",
      body: "hi",
      tenantId: TENANT,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects suppressed recipients", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    h.suppression.add(TENANT, "+15555550000", "STOP");
    const result = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "hi",
      tenantId: TENANT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("suppressed_recipient");
  });

  it("rejects when from-number is not registered", async () => {
    const h = createHarness();
    const result = await h.pipeline.send({
      from: "+15550000000",
      to: "+15555550000",
      body: "hi",
      tenantId: TENANT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("from_unregistered");
  });

  it("rejects when from-number belongs to a different tenant", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const result = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "hi",
      tenantId: "other-tenant",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("tenant_mismatch");
  });

  it("pre-throttles long-code at 1/sec", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const first = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550001",
      body: "1",
      tenantId: TENANT,
    });
    expect(first.ok).toBe(true);
    const second = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550002",
      body: "2",
      tenantId: TENANT,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("rate_limited");
    h.clock.tick(1100);
    const third = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550003",
      body: "3",
      tenantId: TENANT,
    });
    expect(third.ok).toBe(true);
  });

  it("allows higher throughput on short-codes", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "num-short",
      tenantId: TENANT,
      e164: SHORT_CODE,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "short-code",
    });
    for (let i = 0; i < 30; i += 1) {
      const r = await h.pipeline.send({
        from: SHORT_CODE,
        to: `+1555000${1000 + i}`,
        body: `msg ${i}`,
        tenantId: TENANT,
      });
      expect(r.ok).toBe(true);
    }
    const overflow = await h.pipeline.send({
      from: SHORT_CODE,
      to: "+15550009999",
      body: "overflow",
      tenantId: TENANT,
    });
    expect(overflow.ok).toBe(false);
  });

  it("records carrier failures as a failed status event", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const r = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "FAIL_THIS",
      tenantId: TENANT,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("carrier_error");
    // Find the message via the only stored record
    expect(h.store.size()).toBe(1);
  });

  it("progresses through queued → sending → delivered via delivery receipts", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const r = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "track me",
      tenantId: TENANT,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    h.clock.tick(50);
    h.pipeline.applyDeliveryReceipt(r.messageId, "sent", undefined, "DLR_SENT");
    h.clock.tick(200);
    const delivered = h.pipeline.applyDeliveryReceipt(
      r.messageId,
      "delivered",
      "ACK from handset",
      "DLR_DELIVERED",
    );
    expect(delivered.status).toBe("delivered");
    const events = delivered.events.map((e) => e.status);
    expect(events).toEqual(["queued", "sending", "sent", "delivered"]);
  });

  it("rejects empty messages with no media", async () => {
    const h = createHarness();
    registerLongCodeWithA2p(h);
    const r = await h.pipeline.send({
      from: LONG_CODE,
      to: "+15555550000",
      body: "",
      tenantId: TENANT,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_input");
  });
});
