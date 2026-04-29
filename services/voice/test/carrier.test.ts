import { describe, expect, test } from "bun:test";
import { MockCarrier } from "../src/carrier/mock.ts";
import type { CarrierClient } from "../src/carrier/types.ts";

describe("Carrier interface contract", () => {
  test("all methods implemented and async", async () => {
    const c: CarrierClient = new MockCarrier();
    await c.originateCall({
      callId: "x",
      from: "+1",
      to: "+2",
      answerUrl: "https://flow",
    });
    await c.say("x", "hi", {});
    await c.playAudio("x", "https://a.mp3");
    await c.gatherDigits("x", { numDigits: 1 });
    await c.record("x", { maxLengthSec: 10 });
    await c.transfer("x", "+3");
    await c.hangup("x");
    const m = c as MockCarrier;
    const ops = m.events.map((e) => e.op);
    expect(ops).toEqual([
      "originate",
      "say",
      "play",
      "gather",
      "record",
      "transfer",
      "hangup",
    ]);
  });

  test("forced failure mode throws", async () => {
    const c = new MockCarrier();
    c.failMode = { op: "hangup", callId: "x" };
    await expect(c.hangup("x")).rejects.toThrow("forced failure");
  });
});
