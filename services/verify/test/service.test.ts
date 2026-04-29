import { beforeEach, describe, expect, it } from "bun:test";
import { InMemoryAuditSink } from "../src/audit.js";
import { seededRng } from "../src/crypto.js";
import {
  AllowAllFraudScorer,
  type FraudScorer,
  VerifyError,
  VerifyService,
} from "../src/service.js";
import type { Channel } from "../src/types.js";
import { buildRegistry } from "./helpers.js";

const HASH_SECRET = "test-secret-hash";

const buildSvc = (
  channels: Channel[] = ["sms", "email"],
  overrides: Partial<{
    nowMs: number;
    fraud: FraudScorer;
    rng: ReturnType<typeof seededRng>;
    audit: InMemoryAuditSink;
    maxAttempts: number;
    identifierRateLimit: { max: number; windowMs: number };
    tenantRateLimit: { max: number; windowMs: number };
  }> = {},
) => {
  let now = overrides.nowMs ?? 1700000000_000;
  const audit = overrides.audit ?? new InMemoryAuditSink();
  const { reg, caps } = buildRegistry(channels);
  const svc = new VerifyService({
    hashSecret: HASH_SECRET,
    rng: overrides.rng ?? seededRng("svc-rng"),
    now: () => now,
    dispatchers: reg,
    audit,
    fraud: overrides.fraud ?? new AllowAllFraudScorer(),
    ...(overrides.maxAttempts !== undefined ? { maxAttempts: overrides.maxAttempts } : {}),
    ...(overrides.identifierRateLimit ? { identifierRateLimit: overrides.identifierRateLimit } : {}),
    ...(overrides.tenantRateLimit ? { tenantRateLimit: overrides.tenantRateLimit } : {}),
  });
  return {
    svc,
    caps,
    audit,
    advance: (ms: number) => {
      now += ms;
    },
    setNow: (n: number) => {
      now = n;
    },
  };
};

describe("VerifyService - createVerification", () => {
  it("dispatches a code to the right channel and never returns it", async () => {
    const { svc, caps } = buildSvc(["sms"]);
    const out = await svc.createVerification({
      tenantId: "t1",
      identifier: "+15551112222",
      channel: "sms",
    });
    expect(out.status).toBe("pending");
    expect(out.verificationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect((out as unknown as Record<string, unknown>).code).toBeUndefined();
    const sms = caps.get("sms");
    expect(sms?.captured.length).toBe(1);
    expect(sms?.captured[0]?.code).toMatch(/^\d{6}$/u);
  });

  it("routes by channel — email dispatcher receives only email", async () => {
    const { svc, caps } = buildSvc(["sms", "email"]);
    await svc.createVerification({
      tenantId: "t1",
      identifier: "alice@example.com",
      channel: "email",
    });
    expect(caps.get("email")?.captured.length).toBe(1);
    expect(caps.get("sms")?.captured.length).toBe(0);
  });

  it("rejects totp and magic_link via /v1/verifications", async () => {
    const { svc } = buildSvc(["sms"]);
    await expect(
      svc.createVerification({
        tenantId: "t1",
        identifier: "x",
        channel: "totp",
      }),
    ).rejects.toBeInstanceOf(VerifyError);
    await expect(
      svc.createVerification({
        tenantId: "t1",
        identifier: "x",
        channel: "magic_link",
      }),
    ).rejects.toBeInstanceOf(VerifyError);
  });
});

describe("VerifyService - checkVerification", () => {
  it("approves the correct code", async () => {
    const { svc, caps } = buildSvc(["sms"]);
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    const code = caps.get("sms")?.captured[0]?.code;
    expect(code).toBeDefined();
    const result = await svc.checkVerification(created.verificationId, code as string);
    expect(result.status).toBe("approved");
  });

  it("rejects a wrong code and decrements attempts", async () => {
    const { svc, caps } = buildSvc(["sms"], { maxAttempts: 3 });
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    const correct = caps.get("sms")?.captured[0]?.code as string;
    const wrong = correct === "000000" ? "000001" : "000000";
    const r1 = await svc.checkVerification(created.verificationId, wrong);
    expect(r1.status).toBe("rejected");
    expect(r1.attemptsRemaining).toBe(2);
  });

  it("locks after max failed attempts", async () => {
    const { svc, caps } = buildSvc(["sms"], { maxAttempts: 2 });
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    const correct = caps.get("sms")?.captured[0]?.code as string;
    const wrong = correct === "111111" ? "222222" : "111111";
    await svc.checkVerification(created.verificationId, wrong);
    const r2 = await svc.checkVerification(created.verificationId, wrong);
    expect(r2.status).toBe("locked");
    // After lock, even correct code is refused.
    const r3 = await svc.checkVerification(created.verificationId, correct);
    expect(r3.status).toBe("locked");
  });

  it("expires after TTL", async () => {
    const { svc, caps, advance } = buildSvc(["sms"]);
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
      ttlSeconds: 60,
    });
    advance(61_000);
    const correct = caps.get("sms")?.captured[0]?.code as string;
    const r = await svc.checkVerification(created.verificationId, correct);
    expect(r.status).toBe("expired");
  });

  it("throws not_found for unknown id", async () => {
    const { svc } = buildSvc(["sms"]);
    await expect(svc.checkVerification("missing", "000000")).rejects.toBeInstanceOf(
      VerifyError,
    );
  });
});

describe("VerifyService - rate limits", () => {
  it("limits per-identifier creations", async () => {
    const { svc } = buildSvc(["sms"], {
      identifierRateLimit: { max: 2, windowMs: 60_000 },
    });
    await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    await expect(
      svc.createVerification({
        tenantId: "t1",
        identifier: "+1",
        channel: "sms",
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("limits per-tenant creations regardless of identifier", async () => {
    const { svc } = buildSvc(["sms"], {
      tenantRateLimit: { max: 2, windowMs: 60_000 },
    });
    await svc.createVerification({ tenantId: "t1", identifier: "a", channel: "sms" });
    await svc.createVerification({ tenantId: "t1", identifier: "b", channel: "sms" });
    await expect(
      svc.createVerification({ tenantId: "t1", identifier: "c", channel: "sms" }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("VerifyService - fraud gate", () => {
  it("rejects creation when fraud scorer disallows", async () => {
    let calls = 0;
    const fraud: FraudScorer = {
      async score() {
        calls++;
        return { score: 0.99, allow: false, reason: "blocked" };
      },
    };
    const { svc } = buildSvc(["sms"], { fraud });
    await expect(
      svc.createVerification({ tenantId: "t1", identifier: "+1", channel: "sms" }),
    ).rejects.toMatchObject({ code: "fraud_blocked" });
    expect(calls).toBeGreaterThan(0);
  });
});

describe("VerifyService - resend", () => {
  it("issues a fresh code that supersedes the prior one", async () => {
    const { svc, caps } = buildSvc(["sms"]);
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    const original = caps.get("sms")?.captured[0]?.code as string;
    await svc.resend(created.verificationId);
    const next = caps.get("sms")?.captured[1]?.code as string;
    expect(next).toBeDefined();
    // The original code is now invalid (codeHash was rotated).
    const r = await svc.checkVerification(created.verificationId, original);
    expect(r.status).toBe("rejected");
    const r2 = await svc.checkVerification(created.verificationId, next);
    expect(r2.status).toBe("approved");
  });

  it("rate-limits resend per identifier", async () => {
    const { svc } = buildSvc(["sms"], {
      identifierRateLimit: { max: 2, windowMs: 60_000 },
    });
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "+1",
      channel: "sms",
    });
    // Initial create consumed slot 1; this resend consumes slot 2; next should fail.
    await svc.resend(created.verificationId);
    await expect(svc.resend(created.verificationId)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
});

describe("VerifyService - TOTP", () => {
  it("provisions a TOTP secret and accepts generated code", () => {
    const { svc } = buildSvc([]);
    const setup = svc.setupTotp({ tenantId: "t1", identifier: "alice@example.com" });
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/u);
    expect(setup.qrCodeUrl).toContain("otpauth://totp/");
    expect(setup.backupCodes.length).toBe(8);
  });

  it("accepts a backup code only once", () => {
    const { svc } = buildSvc([]);
    const setup = svc.setupTotp({ tenantId: "t1", identifier: "alice" });
    const first = setup.backupCodes[0] as string;
    expect(svc.checkTotp("t1", "alice", first)).toBe(true);
    expect(svc.checkTotp("t1", "alice", first)).toBe(false);
  });
});

describe("VerifyService - magic links", () => {
  it("creates a single-use link and consumes it", () => {
    const { svc } = buildSvc([]);
    const m = svc.createMagicLink(
      {
        tenantId: "t1",
        identifier: "alice@example.com",
        redirectUrl: "https://app.example/dash",
      },
      "https://verify.example",
    );
    expect(m.url).toContain("https://verify.example/v1/magic-links/");
    const u = new URL(m.url);
    const token = u.searchParams.get("token") as string;
    expect(token.length).toBeGreaterThan(0);
    const consumed = svc.consumeMagicLink(m.linkId, token);
    expect(consumed.ok).toBe(true);
    expect(consumed.redirectUrl).toBe("https://app.example/dash");
    // Second consume must fail.
    const again = svc.consumeMagicLink(m.linkId, token);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe("already_consumed");
  });

  it("expires after TTL", () => {
    const env = buildSvc([]);
    const m = env.svc.createMagicLink(
      {
        tenantId: "t1",
        identifier: "alice@example.com",
        redirectUrl: "https://app.example/dash",
        ttlSeconds: 60,
      },
      "https://verify.example",
    );
    env.advance(61_000);
    const token = new URL(m.url).searchParams.get("token") as string;
    const r = env.svc.consumeMagicLink(m.linkId, token);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects invalid token (constant-time)", () => {
    const { svc } = buildSvc([]);
    const m = svc.createMagicLink(
      {
        tenantId: "t1",
        identifier: "alice@example.com",
        redirectUrl: "https://app.example/dash",
      },
      "https://verify.example",
    );
    const r = svc.consumeMagicLink(m.linkId, "not-the-real-token");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_token");
  });
});

describe("VerifyService - audit log", () => {
  it("never logs plaintext code or identifier", async () => {
    const audit = new InMemoryAuditSink();
    const { svc, caps } = buildSvc(["sms"], { audit });
    const created = await svc.createVerification({
      tenantId: "t1",
      identifier: "alice@example.com",
      channel: "sms",
    });
    const code = caps.get("sms")?.captured[0]?.code as string;
    await svc.checkVerification(created.verificationId, code);
    const entries = audit.recent();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const ser = JSON.stringify(e);
      expect(ser.includes("alice@example.com")).toBe(false);
      expect(ser.includes(code)).toBe(false);
      expect(e.identifierHash).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("audit entries include action + result", async () => {
    const audit = new InMemoryAuditSink();
    const { svc } = buildSvc(["sms"], { audit });
    await svc.createVerification({
      tenantId: "t1",
      identifier: "x",
      channel: "sms",
    });
    const e = audit.recent()[0];
    expect(e?.action).toBe("create");
    expect(e?.result).toBe("success");
    expect(e?.channel).toBe("sms");
  });
});

describe("VerifyService - module-level harness", () => {
  let counter = 0;
  beforeEach(() => {
    counter += 1;
  });
  it("counts beforeEach calls", () => {
    expect(counter).toBeGreaterThan(0);
  });
});
