import { describe, expect, it } from "bun:test";
import type { CustomerWebhookForwarder } from "./inbound-handler.ts";
import { InboundHandler } from "./inbound-handler.ts";
import type { InboundMessage } from "../types.ts";
import { createHarness } from "../test-helpers.ts";

const TENANT = "tenant-acme";
const NUMBER = "+15551234567";

describe("InboundHandler", () => {
  it("rejects unknown carriers", async () => {
    const h = createHarness();
    const r = await h.inbound.receive("nonexistent", "sig", "{}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("carrier_unknown");
  });

  it("rejects bad signatures", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: NUMBER,
      capabilities: { sms: true, mms: true, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({ from: "+15550005555", to: NUMBER, body: "Hi" });
    const r = await h.inbound.receive("twilio", "wrong-sig", body);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("signature_invalid");
  });

  it("accepts valid signatures and parses inbound", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: NUMBER,
      capabilities: { sms: true, mms: true, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({
      from: "+15550005555",
      to: NUMBER,
      body: "Hello there",
      carrierMessageId: "twilio-inb-1",
    });
    const sig = h.twilio.signForTest(body);
    const r = await h.inbound.receive("twilio", sig, body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tenantId).toBe(TENANT);
    expect(r.message.from).toBe("+15550005555");
    expect(r.autoSuppressed).toBe(false);
  });

  it("auto-suppresses on STOP keyword", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: NUMBER,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({
      from: "+15550005555",
      to: NUMBER,
      body: "STOP",
    });
    const sig = h.twilio.signForTest(body);
    const r = await h.inbound.receive("twilio", sig, body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.autoSuppressed).toBe(true);
    expect(h.suppression.isSuppressed(TENANT, "+15550005555")).toBe(true);
  });

  it("auto-suppresses on UNSUBSCRIBE with surrounding whitespace", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: NUMBER,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({
      from: "+15550006666",
      to: NUMBER,
      body: "  unsubscribe!  ",
    });
    const sig = h.twilio.signForTest(body);
    const r = await h.inbound.receive("twilio", sig, body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.autoSuppressed).toBe(true);
  });

  it("rejects inbound for unregistered destinations", async () => {
    const h = createHarness();
    const body = JSON.stringify({
      from: "+15550005555",
      to: "+15559999999",
      body: "hi",
    });
    const sig = h.twilio.signForTest(body);
    const r = await h.inbound.receive("twilio", sig, body);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("destination_unregistered");
  });

  it("forwards to the customer webhook when configured", async () => {
    const calls: { url: string; tenantId: string; payload: InboundMessage }[] = [];
    const forwarder: CustomerWebhookForwarder = {
      async forward(url, payload, tenantId) {
        calls.push({ url, tenantId, payload });
      },
    };
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: NUMBER,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    h.webhookByNumber.set(NUMBER, "https://customer.example.com/sms");
    // Re-create handler with forwarder
    const inbound = new InboundHandler({
      carriers: h.carriers,
      numbers: h.numbers,
      suppression: h.suppression,
      webhookByNumber: h.webhookByNumber,
      forwarder,
    });
    const body = JSON.stringify({ from: "+15550007777", to: NUMBER, body: "hello" });
    const sig = h.twilio.signForTest(body);
    const r = await inbound.receive("twilio", sig, body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.forwardedTo).toBe("https://customer.example.com/sms");
    expect(calls.length).toBe(1);
    expect(calls[0]?.tenantId).toBe(TENANT);
  });

  it("rejects malformed inbound payloads", async () => {
    const h = createHarness();
    h.numbers.register({
      numberId: "n1",
      tenantId: TENANT,
      e164: NUMBER,
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    const body = JSON.stringify({ from: "", to: "", body: "" });
    const sig = h.twilio.signForTest(body);
    const r = await h.inbound.receive("twilio", sig, body);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("payload_invalid");
  });
});
