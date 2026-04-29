import { describe, expect, test } from "bun:test";
import { signPayload } from "../src/hmac";
import { PreviewOrchestrator } from "../src/orchestrator";
import { createHandler } from "../src/server";
import { InMemoryStateStore } from "../src/state/store";
import { MockBuildRunner, MockComments, MockDeployer } from "./mocks";

const SECRET = "wh-secret";
const PREVIEW_DOMAIN = "preview.crontech.dev";

function makeServer() {
  const buildRunner = new MockBuildRunner();
  const deployer = new MockDeployer();
  const comments = new MockComments();
  const store = new InMemoryStateStore();
  const orchestrator = new PreviewOrchestrator({
    buildRunner,
    deployer,
    comments,
    store,
    config: { previewDomain: PREVIEW_DOMAIN, now: () => 1 },
  });
  const handler = createHandler({
    orchestrator,
    config: { webhookSecret: SECRET },
  });
  return { handler, buildRunner, deployer, comments, orchestrator };
}

const validPayload = JSON.stringify({
  action: "opened",
  number: 12,
  repository: { name: "btf", owner: { login: "crontech" } },
  pull_request: {
    head: { sha: "deadbeefcafe1234", ref: "feature/x" },
    base: { ref: "main" },
  },
});

async function postPrEvent(
  handler: (req: Request) => Promise<Response>,
  payload: string,
  signature: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (signature) headers["x-hub-signature-256"] = signature;
  return handler(
    new Request("http://localhost/pr-events", {
      method: "POST",
      headers,
      body: payload,
    }),
  );
}

describe("server", () => {
  test("GET /healthz returns 200", async () => {
    const { handler } = makeServer();
    const res = await handler(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
  });

  test("POST /pr-events rejects missing signature", async () => {
    const { handler } = makeServer();
    const res = await postPrEvent(handler, validPayload, undefined);
    expect(res.status).toBe(401);
  });

  test("POST /pr-events rejects bad signature", async () => {
    const { handler } = makeServer();
    const res = await postPrEvent(handler, validPayload, "sha256=deadbeef");
    expect(res.status).toBe(401);
  });

  test("POST /pr-events accepts valid signature and orchestrates", async () => {
    const { handler, buildRunner, deployer } = makeServer();
    const sig = await signPayload(SECRET, validPayload);
    const res = await postPrEvent(handler, validPayload, sig);
    expect(res.status).toBe(202);
    expect(buildRunner.triggers).toHaveLength(1);
    expect(deployer.deploys).toHaveLength(1);
  });

  test("POST /pr-events rejects malformed JSON", async () => {
    const { handler } = makeServer();
    const bad = "not-json";
    const sig = await signPayload(SECRET, bad);
    const res = await postPrEvent(handler, bad, sig);
    expect(res.status).toBe(400);
  });

  test("POST /pr-events rejects schema-invalid payloads", async () => {
    const { handler } = makeServer();
    const bad = JSON.stringify({ action: "opened" });
    const sig = await signPayload(SECRET, bad);
    const res = await postPrEvent(handler, bad, sig);
    expect(res.status).toBe(400);
  });

  test("GET /pr/:prId/status returns the latest state", async () => {
    const { handler } = makeServer();
    const sig = await signPayload(SECRET, validPayload);
    await postPrEvent(handler, validPayload, sig);
    const res = await handler(
      new Request(
        `http://localhost/pr/${encodeURIComponent("crontech/btf#12")}/status`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: { status: string } };
    expect(body.state.status).toBe("live");
  });

  test("GET /pr/:prId/status returns 404 for unknown PR", async () => {
    const { handler } = makeServer();
    const res = await handler(
      new Request(
        `http://localhost/pr/${encodeURIComponent("nope/none#1")}/status`,
      ),
    );
    expect(res.status).toBe(404);
  });

  test("POST /pr/:prId/teardown tears down a known PR", async () => {
    const { handler, deployer } = makeServer();
    const sig = await signPayload(SECRET, validPayload);
    await postPrEvent(handler, validPayload, sig);
    const res = await handler(
      new Request(
        `http://localhost/pr/${encodeURIComponent("crontech/btf#12")}/teardown`,
        { method: "POST" },
      ),
    );
    expect(res.status).toBe(200);
    expect(deployer.teardowns).toHaveLength(1);
  });

  test("unknown route returns 404", async () => {
    const { handler } = makeServer();
    const res = await handler(new Request("http://localhost/who"));
    expect(res.status).toBe(404);
  });
});
