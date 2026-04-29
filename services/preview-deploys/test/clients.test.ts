import { describe, expect, test } from "bun:test";
import { HttpBuildRunnerClient } from "../src/clients/build-runner";
import { HttpDeployOrchestratorClient } from "../src/clients/deploy-orchestrator";

function fakeFetch(handler: (req: Request) => Response | Promise<Response>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as string, init as RequestInit | undefined);
    return handler(req);
  };
}

describe("HttpBuildRunnerClient", () => {
  test("triggerBuild posts and returns parsed result", async () => {
    let captured: Request | undefined;
    const ff = fakeFetch(async (req) => {
      captured = req;
      return new Response(
        JSON.stringify({ buildId: "b-1", artefactUrl: "https://a/1" }),
        { status: 200 },
      );
    });
    const client = new HttpBuildRunnerClient(
      "https://br",
      ff as unknown as typeof fetch,
    );
    const result = await client.triggerBuild({
      owner: "o",
      repo: "r",
      sha: "abcdef1",
      ref: "main",
      buildKey: "k",
      cancelPrevious: true,
    });
    expect(result.buildId).toBe("b-1");
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://br/builds");
  });

  test("triggerBuild throws on non-OK", async () => {
    const ff = fakeFetch(async () => new Response("err", { status: 500 }));
    const client = new HttpBuildRunnerClient(
      "https://br",
      ff as unknown as typeof fetch,
    );
    await expect(
      client.triggerBuild({
        owner: "o",
        repo: "r",
        sha: "abcdef1",
        ref: "main",
        buildKey: "k",
        cancelPrevious: false,
      }),
    ).rejects.toThrow();
  });

  test("triggerBuild throws on malformed response", async () => {
    const ff = fakeFetch(
      async () => new Response(JSON.stringify({ wrong: 1 }), { status: 200 }),
    );
    const client = new HttpBuildRunnerClient(
      "https://br",
      ff as unknown as typeof fetch,
    );
    await expect(
      client.triggerBuild({
        owner: "o",
        repo: "r",
        sha: "abcdef1",
        ref: "main",
        buildKey: "k",
        cancelPrevious: false,
      }),
    ).rejects.toThrow(/malformed/);
  });

  test("cancelBuild tolerates 404", async () => {
    const ff = fakeFetch(async () => new Response(null, { status: 404 }));
    const client = new HttpBuildRunnerClient(
      "https://br",
      ff as unknown as typeof fetch,
    );
    await client.cancelBuild("missing");
  });
});

describe("HttpDeployOrchestratorClient", () => {
  test("deploy posts to /deployments", async () => {
    let captured: Request | undefined;
    const ff = fakeFetch(async (req) => {
      captured = req;
      return new Response(
        JSON.stringify({ deploymentId: "d-1", liveUrl: "https://l" }),
        { status: 201 },
      );
    });
    const client = new HttpDeployOrchestratorClient(
      "https://do",
      ff as unknown as typeof fetch,
    );
    const result = await client.deploy({
      artefactUrl: "https://a",
      hostname: "h.preview.crontech.dev",
      target: "preview",
      deployKey: "k",
    });
    expect(result.deploymentId).toBe("d-1");
    expect(captured?.method).toBe("POST");
  });

  test("teardown sends DELETE with hostname body", async () => {
    let captured: Request | undefined;
    const ff = fakeFetch(async (req) => {
      captured = req;
      return new Response(null, { status: 200 });
    });
    const client = new HttpDeployOrchestratorClient(
      "https://do",
      ff as unknown as typeof fetch,
    );
    await client.teardown({
      deploymentId: "d-1",
      hostname: "h.preview.crontech.dev",
    });
    expect(captured?.method).toBe("DELETE");
    expect(captured?.url).toContain("/deployments/d-1");
  });

  test("teardown tolerates 404", async () => {
    const ff = fakeFetch(async () => new Response(null, { status: 404 }));
    const client = new HttpDeployOrchestratorClient(
      "https://do",
      ff as unknown as typeof fetch,
    );
    await client.teardown({ deploymentId: "missing", hostname: "h" });
  });
});
