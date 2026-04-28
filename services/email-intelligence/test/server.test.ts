import { describe, expect, test } from "bun:test";
import { buildHandler } from "../src/index";
import { StubLlmClient } from "../src/llm-client";

const TOKEN = "test-token-123";

function authedRequest(
  path: string,
  body?: unknown,
  init: RequestInit = {},
): Request {
  return new Request(`http://localhost${path}`, {
    method: body === undefined && init.method === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      ...(init.headers as Record<string, string> | undefined),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    ...(init.method !== undefined && { method: init.method }),
  });
}

function newHandler(opts: { llm?: StubLlmClient } = {}) {
  return buildHandler({
    ...(opts.llm !== undefined && { llm: opts.llm }),
    env: { EMAIL_INTELLIGENCE_TOKEN: TOKEN },
  });
}

describe("server — auth", () => {
  test("missing bearer token rejected", async () => {
    const handler = newHandler();
    const res = await handler(
      new Request("http://localhost/score-spam", {
        method: "POST",
        body: JSON.stringify({ subject: "x", fromDomain: "a.com" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("wrong token rejected", async () => {
    const handler = newHandler();
    const res = await handler(
      new Request("http://localhost/score-spam", {
        method: "POST",
        headers: { authorization: "Bearer WRONG" },
        body: JSON.stringify({ subject: "x", fromDomain: "a.com" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("missing config returns 503", async () => {
    const handler = buildHandler({ env: {} });
    const res = await handler(
      new Request("http://localhost/score-spam", {
        method: "POST",
        headers: { authorization: "Bearer x" },
      }),
    );
    expect(res.status).toBe(503);
  });

  test("health is unauthenticated", async () => {
    const handler = newHandler();
    const res = await handler(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { service: string };
    expect(json.service).toBe("email-intelligence");
  });
});

describe("server — routing", () => {
  test("unknown path returns 404", async () => {
    const handler = newHandler();
    const res = await handler(authedRequest("/nope", {}));
    expect(res.status).toBe(404);
  });

  test("non-POST on data endpoints returns 405", async () => {
    const handler = newHandler();
    const res = await handler(
      new Request("http://localhost/score-spam", {
        method: "DELETE",
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(res.status).toBe(405);
  });
});

describe("server — schema validation", () => {
  test("/score-spam rejects missing fromDomain", async () => {
    const handler = newHandler();
    const res = await handler(authedRequest("/score-spam", { subject: "x" }));
    expect(res.status).toBe(400);
  });

  test("/optimise-subject rejects empty subject", async () => {
    const handler = newHandler();
    const res = await handler(
      authedRequest("/optimise-subject", { subject: "" }),
    );
    expect(res.status).toBe(400);
  });

  test("/score-variants rejects empty variants array", async () => {
    const handler = newHandler();
    const res = await handler(
      authedRequest("/score-variants", { variants: [] }),
    );
    expect(res.status).toBe(400);
  });

  test("invalid JSON body returns 400", async () => {
    const handler = newHandler();
    const res = await handler(
      new Request("http://localhost/score-spam", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("server — happy paths", () => {
  test("/score-spam returns heuristicScore + verdict", async () => {
    const handler = newHandler();
    const res = await handler(
      authedRequest("/score-spam", {
        subject: "Welcome aboard",
        text: "Thanks for joining.",
        fromDomain: "acme.com",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      heuristicScore: number;
      verdict: string;
      signals: unknown[];
    };
    expect(typeof json.heuristicScore).toBe("number");
    expect(["pass", "review", "block"]).toContain(json.verdict);
    expect(Array.isArray(json.signals)).toBe(true);
  });

  test("/optimise-subject with LLM stub returns variants including LLM source", async () => {
    const stub = new StubLlmClient({
      responses: { "subject-variants": "Quick win\nBetter try" },
    });
    const handler = newHandler({ llm: stub });
    const res = await handler(
      authedRequest("/optimise-subject", { subject: "Hello world" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      variants: Array<{ source: string }>;
    };
    expect(json.variants.some((v) => v.source === "llm")).toBe(true);
  });

  test("/optimise-send-time returns 3 candidates", async () => {
    const handler = newHandler();
    const res = await handler(
      authedRequest("/optimise-send-time", {
        recipientHistory: [
          { sentAt: "2026-04-14T09:00:00Z", opened: true },
          { sentAt: "2026-04-21T09:00:00Z", opened: true },
        ],
        recipientTimezone: "UTC",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      candidates: Array<{ sendAt: string }>;
    };
    expect(json.candidates.length).toBe(3);
  });

  test("/score-variants ranks variants", async () => {
    const handler = newHandler();
    const res = await handler(
      authedRequest("/score-variants", {
        variants: [
          {
            id: "a",
            subject: "Hello world",
            html: "<p>hi</p>",
            fromDomain: "acme.com",
          },
          {
            id: "b",
            subject: "WIN BIG !!!",
            html: '<a href="x">click here now</a>',
            fromDomain: "winner.zip",
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ranked: Array<{ id: string; rank: number }>;
    };
    expect(json.ranked.length).toBe(2);
    expect(json.ranked[0]?.rank).toBe(1);
  });
});

describe("HttpAiGatewayClient", () => {
  test("posts to gateway with bearer + parses response", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: import("../src/llm-client").FetchLike = (
      input: Request | string | URL,
      init?: RequestInit,
    ) => {
      calls.push({
        url: typeof input === "string" ? input : input.toString(),
        init: init ?? {},
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "47" } }],
            model: "claude-3-5-haiku-latest",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const { HttpAiGatewayClient } = await import("../src/llm-client");
    const client = new HttpAiGatewayClient({
      baseUrl: "http://gateway.test",
      token: "tok",
      fetchImpl,
    });
    const reply = await client.complete({
      purpose: "spam-score",
      prompt: "rate this",
    });
    expect(reply.text).toBe("47");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://gateway.test/v1/chat/completions");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-purpose"]).toBe("spam-score");
  });

  test("non-2xx responses throw", async () => {
    const fetchImpl: import("../src/llm-client").FetchLike = () =>
      Promise.resolve(new Response("nope", { status: 500 }));
    const { HttpAiGatewayClient } = await import("../src/llm-client");
    const client = new HttpAiGatewayClient({
      baseUrl: "http://gateway.test",
      token: "tok",
      fetchImpl,
    });
    await expect(
      client.complete({ purpose: "spam-score", prompt: "x" }),
    ).rejects.toThrow(/ai-gateway 500/);
  });
});
