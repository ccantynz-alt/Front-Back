import { describe, expect, test } from "bun:test";
import { makeHarness } from "../test-helpers.ts";
import type { SendMessageInput } from "../types.ts";

const baseInput = (overrides: Partial<SendMessageInput> = {}): SendMessageInput => ({
  from: "sender@sender.example",
  to: ["target@recipient.example"],
  subject: "Hello",
  text: "Body",
  tenantId: "tenant-a",
  ...overrides,
});

describe("SendPipeline.accept", () => {
  test("rejects when domain validation fails", async () => {
    const h = makeHarness();
    const result = await h.pipeline.accept(baseInput({ from: "spoof@notmine.example" }));
    expect(result.status).toBe("rejected");
    expect(result.reason).toBeDefined();
  });

  test("queues a valid message and emits a queued event", async () => {
    const h = makeHarness({ delivererScript: { "target@recipient.example": { smtpCode: 250 } } });
    const result = await h.pipeline.accept(baseInput());
    expect(result.status).toBe("queued");
    const stored = h.store.get(result.messageId);
    expect(stored?.events.some((e) => e.type === "queued")).toBe(true);
  });

  test("drops sends to fully-suppressed recipients before queueing", async () => {
    const h = makeHarness();
    h.suppression.add("tenant-a", "target@recipient.example", "hard-bounce");
    const result = await h.pipeline.accept(baseInput());
    expect(result.status).toBe("suppressed");
    expect(h.queue.size()).toBe(0);
  });

  test("schedules a future-dated message", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const h = makeHarness({ now: () => Date.parse("2026-04-28T00:00:00.000Z") });
    const result = await h.pipeline.accept(baseInput({ scheduledAt: future }));
    expect(result.status).toBe("scheduled");
  });
});

describe("SendPipeline.tick (delivery)", () => {
  test("2xx response → delivered + sent events", async () => {
    const h = makeHarness({ delivererScript: { "target@recipient.example": { smtpCode: 250 } } });
    const r = await h.pipeline.accept(baseInput());
    await h.pipeline.tick();
    const stored = h.store.get(r.messageId);
    expect(stored?.status).toBe("delivered");
    expect(stored?.events.some((e) => e.type === "sent")).toBe(true);
    expect(stored?.events.some((e) => e.type === "delivered")).toBe(true);
  });

  test("5xx response → bounced + adds to suppression", async () => {
    const h = makeHarness({
      mxRecords: { "bouncy.example": [{ exchange: "mx1.bouncy.example", priority: 10 }] },
      delivererScript: { "user@bouncy.example": { smtpCode: 550, message: "no such user" } },
    });
    const r = await h.pipeline.accept(baseInput({ to: ["user@bouncy.example"] }));
    await h.pipeline.tick();
    const stored = h.store.get(r.messageId);
    expect(stored?.status).toBe("bounced");
    expect(stored?.events.some((e) => e.type === "bounced")).toBe(true);
    expect(h.suppression.isSuppressed("tenant-a", "user@bouncy.example")).toBe(true);
  });

  test("4xx response → re-queued for retry, no suppression", async () => {
    const h = makeHarness({
      mxRecords: { "soft.example": [{ exchange: "mx1.soft.example", priority: 10 }] },
      delivererScript: { "user@soft.example": { smtpCode: 421, message: "try later" } },
    });
    const r = await h.pipeline.accept(baseInput({ to: ["user@soft.example"] }));
    await h.pipeline.tick();
    const stored = h.store.get(r.messageId);
    expect(stored?.status).toBe("queued");
    expect(h.queue.size()).toBe(1);
    expect(h.suppression.isSuppressed("tenant-a", "user@soft.example")).toBe(false);
  });

  test("missing MX → hard bounce", async () => {
    const h = makeHarness({
      mxRecords: {},
      delivererScript: {},
    });
    const r = await h.pipeline.accept(baseInput({ to: ["user@unknown.example"] }));
    await h.pipeline.tick();
    const stored = h.store.get(r.messageId);
    expect(stored?.events.some((e) => e.type === "bounced" && e.detail?.includes("no-mx"))).toBe(
      true,
    );
    expect(h.suppression.isSuppressed("tenant-a", "user@unknown.example")).toBe(true);
  });

  test("DKIM signing key is fetched and applied (mocked client)", async () => {
    let signingKeyFetched = false;
    const h = makeHarness({
      domainState: {
        validTenants: {
          "tenant-a": {
            domains: ["sender.example"],
            signingKeys: { "sender.example": "PEM" },
          },
        },
      },
      delivererScript: { "target@recipient.example": { smtpCode: 250 } },
    });
    // Wrap the deliverer to inspect the raw payload.
    const originalDeliver = h.deliverer.deliver.bind(h.deliverer);
    h.deliverer.deliver = async (a) => {
      if (a.raw.includes("DKIM-Signature:")) signingKeyFetched = true;
      return originalDeliver(a);
    };
    await h.pipeline.accept(baseInput());
    await h.pipeline.tick();
    expect(signingKeyFetched).toBe(true);
  });
});
