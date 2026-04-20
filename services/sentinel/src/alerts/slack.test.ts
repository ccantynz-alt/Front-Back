// ── Slack alerter unit tests ────────────────────────────────────────
// Validates the three contract rules of postToSlack:
//   1. No webhook configured → { sent: false, reason: "no webhook configured" }
//      (never throws, never crashes the daemon).
//   2. Webhook configured but endpoint returns non-2xx →
//      { sent: false, reason: "http <status>" }.
//   3. Outbound body is secret-scrubbed before transmission.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { postToSlack, scrubSecrets } from "./slack";

// Snapshot & restore env vars + global fetch so tests do not leak.
const SLACK_ENV_VARS = [
  "SLACK_WEBHOOK_URL",
  "SLACK_WEBHOOK_CRITICAL",
  "SLACK_WEBHOOK_DAILY",
  "SLACK_WEBHOOK_WEEKLY",
] as const;

const originalEnv: Record<string, string | undefined> = {};
const originalFetch: typeof globalThis.fetch = globalThis.fetch;

beforeEach(() => {
  for (const key of SLACK_ENV_VARS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of SLACK_ENV_VARS) {
    const prior = originalEnv[key];
    if (prior === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prior;
    }
  }
  globalThis.fetch = originalFetch;
});

describe("postToSlack", () => {
  test("returns {sent:false} with reason when SLACK_WEBHOOK_URL unset", async () => {
    const result = await postToSlack("critical", "test message");
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no webhook configured");
  });

  test("posts and returns {sent:true} on 2xx response", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.example/test";
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: url.toString(),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await postToSlack("daily", "hello world");
    expect(result.sent).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall !== undefined) {
      expect(firstCall.url).toBe("https://hooks.slack.example/test");
      const payload = JSON.parse(firstCall.body) as { text: string };
      expect(payload.text).toContain("hello world");
      expect(payload.text).toContain("[DAILY]");
    }
  });

  test("returns {sent:false, reason:'http N'} on non-2xx", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.example/broken";
    globalThis.fetch = (async () =>
      new Response("server boom", { status: 500 })) as unknown as typeof fetch;

    const result = await postToSlack("critical", "probe");
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("http 500");
  });

  test("scrubs secrets in the outbound body before transmission", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.example/scrub";
    const captured: string[] = [];
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      captured.push(typeof init?.body === "string" ? init.body : "");
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const dirty =
      "leaked sk-abc123XYZ_deadbeef0011223344 and Bearer eyJhbGciOi.fake and OPENAI_API_KEY=sk-dontship-xyz";
    const result = await postToSlack("critical", dirty);

    expect(result.sent).toBe(true);
    const body = captured[0];
    expect(body).toBeDefined();
    if (body !== undefined) {
      expect(body).toContain("[REDACTED]");
      expect(body).not.toContain("sk-abc123XYZ_deadbeef0011223344");
      expect(body).not.toContain("eyJhbGciOi.fake");
      expect(body).not.toContain("sk-dontship-xyz");
    }
  });

  test("returns {sent:false} with error reason when fetch throws", async () => {
    process.env["SLACK_WEBHOOK_URL"] = "https://hooks.slack.example/throws";
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await postToSlack("weekly", "x");
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("ECONNREFUSED");
  });
});

describe("scrubSecrets", () => {
  test("redacts OpenAI-style sk- keys", () => {
    const out = scrubSecrets("token sk-abcdefghijklmnopqrstuv done");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuv");
  });

  test("redacts Bearer tokens", () => {
    const out = scrubSecrets("Authorization: Bearer eyJhbGciOi.payload.sig");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("eyJhbGciOi.payload.sig");
  });

  test("redacts KEY/SECRET/TOKEN/PASSWORD env-style assignments", () => {
    const cases = [
      "API_KEY=foo-bar-baz",
      "GITHUB_TOKEN=gh_xxxxxxxx",
      "MY_SECRET=hushhush",
      "DB_PASSWORD=letmein",
    ];
    for (const c of cases) {
      const out = scrubSecrets(c);
      expect(out).toContain("[REDACTED]");
      expect(out).not.toContain(c.split("=")[1]);
    }
  });

  test("leaves clean messages untouched", () => {
    const clean = "normal message with nothing sensitive 123";
    expect(scrubSecrets(clean)).toBe(clean);
  });
});
