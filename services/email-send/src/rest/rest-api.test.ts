import { describe, expect, test } from "bun:test";
import { makeHarness } from "../test-helpers.ts";
import { RestApi } from "./rest-api.ts";

const TOKEN = "test-bearer";

const makeApi = () => {
  const h = makeHarness({ delivererScript: { "target@recipient.example": { smtpCode: 250 } } });
  const api = new RestApi({ pipeline: h.pipeline, store: h.store, bearerToken: TOKEN });
  return { api, harness: h };
};

const post = (api: RestApi, body: unknown, withAuth = true): Promise<Response> =>
  api.handle(
    new Request("http://test/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(withAuth ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

describe("RestApi", () => {
  test("health endpoint is unauthenticated", async () => {
    const { api } = makeApi();
    const res = await api.handle(new Request("http://test/health"));
    expect(res.status).toBe(200);
  });

  test("rejects without bearer token", async () => {
    const { api } = makeApi();
    const res = await post(
      api,
      {
        from: "sender@sender.example",
        to: ["target@recipient.example"],
        subject: "Hi",
        text: "x",
        tenantId: "tenant-a",
      },
      false,
    );
    expect(res.status).toBe(401);
  });

  test("validation failure returns 422 with issue list", async () => {
    const { api } = makeApi();
    const res = await post(api, { from: "not-an-email", to: [], subject: "" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("validation-failed");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  test("accepted message returns 202 with id", async () => {
    const { api } = makeApi();
    const res = await post(api, {
      from: "sender@sender.example",
      to: ["target@recipient.example"],
      subject: "Hi",
      text: "x",
      tenantId: "tenant-a",
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("queued");
    expect(body.id).toBeDefined();
  });

  test("rejected message returns 403 when domain unverified", async () => {
    const { api } = makeApi();
    const res = await post(api, {
      from: "spoof@bad.example",
      to: ["target@recipient.example"],
      subject: "Hi",
      text: "x",
      tenantId: "tenant-a",
    });
    expect(res.status).toBe(403);
  });

  test("GET /v1/messages/:id returns message detail", async () => {
    const { api } = makeApi();
    const created = await post(api, {
      from: "sender@sender.example",
      to: ["target@recipient.example"],
      subject: "Hi",
      text: "x",
      tenantId: "tenant-a",
    });
    const { id } = (await created.json()) as { id: string };
    const detail = await api.handle(
      new Request(`http://test/v1/messages/${id}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { id: string; status: string };
    expect(body.id).toBe(id);
  });

  test("GET /v1/messages/:id/events returns event list", async () => {
    const { api, harness } = makeApi();
    const created = await post(api, {
      from: "sender@sender.example",
      to: ["target@recipient.example"],
      subject: "Hi",
      text: "x",
      tenantId: "tenant-a",
    });
    const { id } = (await created.json()) as { id: string };
    await harness.pipeline.tick();
    const events = await api.handle(
      new Request(`http://test/v1/messages/${id}/events`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(events.status).toBe(200);
    const body = (await events.json()) as { id: string; events: { type: string }[] };
    expect(body.events.some((e) => e.type === "delivered")).toBe(true);
  });

  test("unknown route returns 404", async () => {
    const { api } = makeApi();
    const res = await api.handle(
      new Request("http://test/v1/nope", { headers: { authorization: `Bearer ${TOKEN}` } }),
    );
    expect(res.status).toBe(404);
  });

  test("invalid JSON body returns 400", async () => {
    const { api } = makeApi();
    const res = await api.handle(
      new Request("http://test/v1/messages", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
