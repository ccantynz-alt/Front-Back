/**
 * Unit tests for the Gluecron platform self-deploy webhook.
 *
 * Mirrors `gluecron-push.test.ts` style:
 *   - inject overrides via `createGluecronPlatformDeployApp({ ... })` so the
 *     real deploy-agent is never reached and global env state is untouched.
 *   - `triggerDeploy` is replaced with a sync mock that records every call
 *     so we can assert what would have been sent to localhost:9091/deploy.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createGluecronPlatformDeployApp } from "./gluecron-platform-deploy";

const SECRET = "whsec_gluecron_test_secret_1234567890";
const AGENT_SECRET = "agent_secret_test_value_xyz";
const VALID_SHA = "a".repeat(40);

interface TriggerCall {
  agentUrl: string;
  agentSecret: string;
  sha: string;
}

function setup(
  options: {
    webhookSecret?: string | undefined;
    agentSecret?: string | undefined;
    agentUrl?: string;
  } = {},
): { app: ReturnType<typeof createGluecronPlatformDeployApp>; calls: TriggerCall[] } {
  const calls: TriggerCall[] = [];
  // `in` lets us distinguish "key explicitly set to undefined" (caller wants
  // the missing-secret path) from "key omitted" (caller wants the default).
  // Using `??` here would conflate the two and hide the 503 branch.
  const webhookSecret = "webhookSecret" in options ? options.webhookSecret : SECRET;
  const agentSecret = "agentSecret" in options ? options.agentSecret : AGENT_SECRET;
  const agentUrl = options.agentUrl ?? "http://127.0.0.1:9091";
  const app = createGluecronPlatformDeployApp({
    getWebhookSecret: () => webhookSecret,
    getAgentSecret: () => agentSecret,
    getAgentUrl: () => agentUrl,
    triggerDeploy: (input) => {
      calls.push(input);
    },
  });
  return { app, calls };
}

function validPayload(
  overrides: Partial<{
    repository: string;
    sha: string;
    branch: string;
    ref: string;
    source: "gluecron";
    timestamp: string;
  }> = {},
): unknown {
  return {
    repository: overrides.repository ?? "ccantynz-alt/Crontech",
    sha: overrides.sha ?? VALID_SHA,
    branch: overrides.branch ?? "Main",
    ref: overrides.ref ?? "refs/heads/Main",
    source: overrides.source ?? ("gluecron" as const),
    ...(overrides.timestamp !== undefined ? { timestamp: overrides.timestamp } : {}),
  };
}

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/hooks/gluecron/platform", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("gluecron-platform-deploy", () => {
  describe("auth", () => {
    test("503 when GLUECRON_WEBHOOK_SECRET is not configured", async () => {
      const { app, calls } = setup({ webhookSecret: undefined });
      const res = await app.request(
        postRequest(validPayload(), { Authorization: `Bearer ${SECRET}` }),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("GLUECRON_WEBHOOK_SECRET");
      expect(calls.length).toBe(0);
    });

    test("401 when Authorization header missing", async () => {
      const { app, calls } = setup();
      const res = await app.request(postRequest(validPayload()));
      expect(res.status).toBe(401);
      expect(calls.length).toBe(0);
    });

    test("401 when bearer token does not match", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload(), { Authorization: "Bearer wrong_token" }),
      );
      expect(res.status).toBe(401);
      expect(calls.length).toBe(0);
    });

    test("401 when Authorization header is malformed (no Bearer prefix)", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload(), { Authorization: SECRET }),
      );
      expect(res.status).toBe(401);
      expect(calls.length).toBe(0);
    });
  });

  describe("payload validation", () => {
    beforeEach(() => {
      // Each test starts with a fresh app via setup(); nothing global to reset.
    });

    test("400 on invalid JSON body", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        new Request("http://test/hooks/gluecron/platform", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SECRET}`,
          },
          body: "{not valid json",
        }),
      );
      expect(res.status).toBe(400);
      expect(calls.length).toBe(0);
    });

    test("400 when required fields missing", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(
          { source: "gluecron" }, // missing repository, sha, branch, ref
          { Authorization: `Bearer ${SECRET}` },
        ),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("invalid payload");
      expect(calls.length).toBe(0);
    });

    test("400 when sha is not 40 hex chars", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload({ sha: "tooshort" }), {
          Authorization: `Bearer ${SECRET}`,
        }),
      );
      expect(res.status).toBe(400);
      expect(calls.length).toBe(0);
    });

    test("400 when source is not literal 'gluecron'", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(
          { ...(validPayload() as Record<string, unknown>), source: "github" },
          { Authorization: `Bearer ${SECRET}` },
        ),
      );
      expect(res.status).toBe(400);
      expect(calls.length).toBe(0);
    });
  });

  describe("repo + branch filtering", () => {
    test("ignores pushes to a non-platform repo", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload({ repository: "ccantynz-alt/some-other-repo" }), {
          Authorization: `Bearer ${SECRET}`,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ignored: boolean; reason: string };
      expect(body.ignored).toBe(true);
      expect(body.reason).toBe("wrong_repo");
      expect(calls.length).toBe(0);
    });

    test("ignores pushes to a non-allowlisted branch", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload({ branch: "develop" }), {
          Authorization: `Bearer ${SECRET}`,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ignored: boolean; reason: string };
      expect(body.ignored).toBe(true);
      expect(body.reason).toBe("wrong_branch");
      expect(calls.length).toBe(0);
    });

    test("triggers deploy on push to Main (capitalised)", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload({ branch: "Main" }), {
          Authorization: `Bearer ${SECRET}`,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        triggered: boolean;
        branch: string;
        sha: string;
      };
      expect(body.triggered).toBe(true);
      expect(body.branch).toBe("Main");
      expect(body.sha).toBe(VALID_SHA);
      expect(calls.length).toBe(1);
      expect(calls[0]?.agentSecret).toBe(AGENT_SECRET);
      expect(calls[0]?.sha).toBe(VALID_SHA);
    });

    test("triggers deploy on push to main (lowercase) — both allowlisted", async () => {
      const { app, calls } = setup();
      const res = await app.request(
        postRequest(validPayload({ branch: "main", ref: "refs/heads/main" }), {
          Authorization: `Bearer ${SECRET}`,
        }),
      );
      expect(res.status).toBe(200);
      expect(calls.length).toBe(1);
      expect(calls[0]?.sha).toBe(VALID_SHA);
    });
  });

  describe("deploy-agent integration", () => {
    test("503 when DEPLOY_AGENT_SECRET is not configured", async () => {
      const { app, calls } = setup({ agentSecret: undefined });
      const res = await app.request(
        postRequest(validPayload(), { Authorization: `Bearer ${SECRET}` }),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("DEPLOY_AGENT_SECRET");
      expect(calls.length).toBe(0);
    });

    test("forwards configured agent URL to triggerDeploy", async () => {
      const customUrl = "http://127.0.0.1:9999";
      const { app, calls } = setup({ agentUrl: customUrl });
      const res = await app.request(
        postRequest(validPayload(), { Authorization: `Bearer ${SECRET}` }),
      );
      expect(res.status).toBe(200);
      expect(calls.length).toBe(1);
      expect(calls[0]?.agentUrl).toBe(customUrl);
    });
  });
});
