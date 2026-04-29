import { describe, expect, it } from "bun:test";
import { seededRng } from "../src/crypto.js";
import { buildHandler } from "../src/server.js";
import { VerifyService } from "../src/service.js";
import { buildRegistry } from "./helpers.js";

const TOKEN = "test-bearer";
const HASH = "test-hash";

const buildHarness = () => {
  const { reg, caps } = buildRegistry(["sms", "email"]);
  let now = 1700000000_000;
  const svc = new VerifyService({
    hashSecret: HASH,
    rng: seededRng("server-rng"),
    now: () => now,
    dispatchers: reg,
  });
  const handler = buildHandler({
    authToken: TOKEN,
    baseUrl: "https://verify.example",
    service: svc,
  });
  return {
    handler,
    caps,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const auth = (extra: Record<string, string> = {}): Record<string, string> => ({
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  ...extra,
});

describe("HTTP server", () => {
  it("rejects unauthenticated requests", async () => {
    const { handler } = buildHarness();
    const res = await handler(
      new Request("http://x/v1/verifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "t", identifier: "+1", channel: "sms" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("health endpoint is unauthenticated", async () => {
    const { handler } = buildHarness();
    const res = await handler(new Request("http://x/health"));
    expect(res.status).toBe(200);
  });

  it("creates and approves a verification", async () => {
    const { handler, caps } = buildHarness();
    const create = await handler(
      new Request("http://x/v1/verifications", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ tenantId: "t1", identifier: "+1", channel: "sms" }),
      }),
    );
    expect(create.status).toBe(201);
    const body = (await create.json()) as { verificationId: string };
    const code = caps.get("sms")?.captured[0]?.code as string;

    const check = await handler(
      new Request(`http://x/v1/verifications/${body.verificationId}/check`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ code }),
      }),
    );
    expect(check.status).toBe(200);
    const result = (await check.json()) as { status: string };
    expect(result.status).toBe("approved");
  });

  it("returns 400 with zod issues on bad input", async () => {
    const { handler } = buildHarness();
    const res = await handler(
      new Request("http://x/v1/verifications", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ tenantId: "", identifier: "x", channel: "carrier-pigeon" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("magic-link create + GET consume", async () => {
    const { handler } = buildHarness();
    const create = await handler(
      new Request("http://x/v1/magic-links", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          tenantId: "t1",
          identifier: "alice@example.com",
          redirectUrl: "https://app.example/d",
        }),
      }),
    );
    expect(create.status).toBe(201);
    const body = (await create.json()) as { linkId: string; url: string };
    const u = new URL(body.url);
    const token = u.searchParams.get("token") as string;
    const consume = await handler(
      new Request(`http://x/v1/magic-links/${body.linkId}?token=${token}`, {
        method: "GET",
        headers: auth(),
      }),
    );
    expect(consume.status).toBe(200);
    const j = (await consume.json()) as { ok: boolean; redirectUrl: string };
    expect(j.ok).toBe(true);
    expect(j.redirectUrl).toBe("https://app.example/d");
  });

  it("totp setup returns QR + backup codes", async () => {
    const { handler } = buildHarness();
    const res = await handler(
      new Request("http://x/v1/totp/secrets", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ tenantId: "t1", identifier: "alice" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      secret: string;
      qrCodeUrl: string;
      backupCodes: string[];
    };
    expect(body.secret).toMatch(/^[A-Z2-7]+$/u);
    expect(body.qrCodeUrl).toContain("otpauth://totp/");
    expect(body.backupCodes.length).toBe(8);
  });

  it("returns 404 for unknown route", async () => {
    const { handler } = buildHarness();
    const res = await handler(
      new Request("http://x/nope", { method: "GET", headers: auth() }),
    );
    expect(res.status).toBe(404);
  });
});
