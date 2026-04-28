import { describe, expect, it } from "bun:test";
import {
  BandwidthCarrier,
  CarrierRegistry,
  MessageBirdCarrier,
  MockCarrier,
  TwilioCarrier,
} from "./index.ts";
import type { Carrier } from "../types.ts";

describe("Carrier contract", () => {
  const carriers: Carrier[] = [
    new MockCarrier({ name: "mock", inboundSecret: "s" }),
    new TwilioCarrier("t-secret"),
    new MessageBirdCarrier("mb-secret"),
    new BandwidthCarrier("bw-secret"),
  ];

  for (const carrier of carriers) {
    it(`${carrier.name} accepts a send and returns a carrier message id`, async () => {
      const result = await carrier.send({
        from: "+15550001111",
        to: "+15550002222",
        body: "test",
        mediaUrls: [],
      });
      expect(result.carrierMessageId.length).toBeGreaterThan(0);
      expect(result.acceptedStatus).toBe("sending");
    });

    it(`${carrier.name} rejects forged signatures`, () => {
      const ok = carrier.verifyInboundSignature("hello", "deadbeef");
      expect(ok).toBe(false);
    });
  }

  it("MockCarrier round-trips inbound parse", () => {
    const carrier = new MockCarrier({ name: "mock", inboundSecret: "x" });
    const body = JSON.stringify({
      from: "+15550003333",
      to: "+15550004444",
      body: "hello",
      carrierMessageId: "abc-1",
    });
    const sig = carrier.signForTest(body);
    expect(carrier.verifyInboundSignature(body, sig)).toBe(true);
    const parsed = carrier.parseInbound(body);
    expect(parsed.from).toBe("+15550003333");
    expect(parsed.to).toBe("+15550004444");
    expect(parsed.body).toBe("hello");
    expect(parsed.carrierMessageId).toBe("abc-1");
  });

  it("CarrierRegistry rejects duplicates and returns named carriers", () => {
    const reg = new CarrierRegistry();
    const a = new MockCarrier({ name: "a", inboundSecret: "x" });
    reg.register(a);
    expect(() => reg.register(a)).toThrow();
    expect(reg.list()).toEqual(["a"]);
    expect(reg.require("a")).toBe(a);
    expect(() => reg.require("missing")).toThrow();
  });

  it("MockCarrier raises when fail token matches", async () => {
    const carrier = new MockCarrier({
      name: "fail",
      inboundSecret: "x",
      failOnBodyContains: "BOOM",
    });
    await expect(
      carrier.send({ from: "a", to: "b", body: "BOOM", mediaUrls: [] }),
    ).rejects.toThrow();
  });
});
