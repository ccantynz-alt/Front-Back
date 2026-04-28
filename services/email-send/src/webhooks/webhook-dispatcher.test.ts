import { describe, expect, test } from "bun:test";
import type { FetchLike } from "../clients/domain-client.ts";
import type { DeliveryEvent } from "../types.ts";
import { WebhookDispatcher } from "./webhook-dispatcher.ts";

const makeEvent = (type: DeliveryEvent["type"]): DeliveryEvent => ({
  id: "evt-1",
  messageId: "msg-1",
  type,
  occurredAt: "2026-04-28T00:00:00.000Z",
});

describe("WebhookDispatcher", () => {
  test("returns false when no config registered", async () => {
    const wh = new WebhookDispatcher(async () => new Response("", { status: 200 }));
    const ok = await wh.dispatch("missing-tenant", makeEvent("delivered"));
    expect(ok).toBe(false);
  });

  test("filters out events the customer did not subscribe to", async () => {
    let called = false;
    const fetcher: FetchLike = async () => {
      called = true;
      return new Response("", { status: 200 });
    };
    const wh = new WebhookDispatcher(fetcher);
    wh.configure({
      tenantId: "t1",
      url: "http://hook.example",
      secret: "sek",
      events: ["delivered"],
    });
    await wh.dispatch("t1", makeEvent("opened"));
    expect(called).toBe(false);
  });

  test("delivers configured event with HMAC signature", async () => {
    let captured: { headers: Record<string, string>; body: string } | null = null;
    const fetcher: FetchLike = async (_url, init) => {
      const headers: Record<string, string> = {};
      const h = init?.headers;
      if (h && typeof h === "object" && !Array.isArray(h)) {
        for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = String(v);
      }
      captured = { headers, body: String(init?.body ?? "") };
      return new Response("", { status: 200 });
    };
    const wh = new WebhookDispatcher(fetcher);
    wh.configure({
      tenantId: "t1",
      url: "http://hook.example",
      secret: "sek",
      events: ["delivered", "bounced"],
    });
    const ok = await wh.dispatch("t1", makeEvent("delivered"));
    expect(ok).toBe(true);
    expect(captured).not.toBeNull();
    const cap = captured as unknown as { headers: Record<string, string>; body: string };
    expect(cap.headers["x-crontech-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(cap.headers["x-crontech-event"]).toBe("delivered");
    expect(cap.body).toContain('"type":"delivered"');
  });

  test("returns false on transport failure", async () => {
    const fetcher: FetchLike = async () => {
      throw new Error("boom");
    };
    const wh = new WebhookDispatcher(fetcher);
    wh.configure({
      tenantId: "t1",
      url: "http://hook.example",
      secret: "sek",
      events: ["delivered"],
    });
    const ok = await wh.dispatch("t1", makeEvent("delivered"));
    expect(ok).toBe(false);
  });

  test("returns false on non-2xx response", async () => {
    const fetcher: FetchLike = async () => new Response("", { status: 500 });
    const wh = new WebhookDispatcher(fetcher);
    wh.configure({
      tenantId: "t1",
      url: "http://hook.example",
      secret: "sek",
      events: ["delivered"],
    });
    const ok = await wh.dispatch("t1", makeEvent("delivered"));
    expect(ok).toBe(false);
  });
});
