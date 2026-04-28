import { describe, expect, it } from "bun:test";
import { buildHandler } from "../src/index";
import { StubLlmClient } from "../src/llm-client";
import { ConversationMemory, StubVectorSearch } from "../src/memory";

const TOKEN = "test-comms-token";

function buildServer(overrides: {
  llm?: StubLlmClient;
  memory?: ConversationMemory;
  vector?: StubVectorSearch;
} = {}) {
  return buildHandler({
    ...(overrides.llm !== undefined && { llm: overrides.llm }),
    ...(overrides.memory !== undefined && { memory: overrides.memory }),
    ...(overrides.vector !== undefined && { vector: overrides.vector }),
    env: { COMMS_INTELLIGENCE_TOKEN: TOKEN },
  });
}

function authedReq(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, init);
}

describe("HTTP handler — /health", () => {
  it("returns ok and module list without auth", async () => {
    const server = buildServer();
    const res = await server.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; modules: string[] };
    expect(json.status).toBe("ok");
    expect(json.modules).toContain("voice-agent");
    expect(json.modules).toContain("fraud");
  });
});

describe("HTTP handler — auth", () => {
  it("rejects requests with no bearer token", async () => {
    const server = buildServer();
    const res = await server.fetch(
      new Request("http://localhost/score-fraud", {
        method: "POST",
        body: JSON.stringify({ identifier: "+1", channel: "sms" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects wrong tokens", async () => {
    const server = buildServer();
    const res = await server.fetch(
      new Request("http://localhost/score-fraud", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: JSON.stringify({ identifier: "+12025550100", channel: "sms" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when token is unset", async () => {
    const server = buildHandler({ env: {} });
    const res = await server.fetch(authedReq("POST", "/score-fraud", { identifier: "+1", channel: "sms" }));
    expect(res.status).toBe(503);
  });
});

describe("HTTP handler — /score-fraud", () => {
  it("returns score, signals, decision for valid input", async () => {
    const server = buildServer();
    const res = await server.fetch(
      authedReq("POST", "/score-fraud", {
        identifier: "+12025550100",
        channel: "sms",
        ipAddress: "8.8.8.8",
        userAgent: "Mozilla/5.0",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      score: number;
      signals: string[];
      decision: string;
    };
    expect(json.decision).toBe("allow");
    expect(typeof json.score).toBe("number");
  });

  it("rejects missing identifier with schema error", async () => {
    const server = buildServer();
    const res = await server.fetch(
      authedReq("POST", "/score-fraud", { channel: "sms" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid channel enum", async () => {
    const server = buildServer();
    const res = await server.fetch(
      authedReq("POST", "/score-fraud", {
        identifier: "+12025550100",
        channel: "carrier-pigeon",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP handler — /classify", () => {
  it("returns sentiment, intent, confidence", async () => {
    const server = buildServer();
    const res = await server.fetch(
      authedReq("POST", "/classify", { text: "This is the worst service ever" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      sentiment: string;
      intent: string;
      confidence: number;
    };
    expect(json.sentiment).toBe("negative");
  });

  it("rejects empty text", async () => {
    const server = buildServer();
    const res = await server.fetch(authedReq("POST", "/classify", { text: "" }));
    expect(res.status).toBe(400);
  });
});

describe("HTTP handler — /memory/:conversationId/*", () => {
  it("appends and retrieves messages", async () => {
    const memory = new ConversationMemory();
    const server = buildServer({ memory });
    const append = await server.fetch(
      authedReq("POST", "/memory/conv-1/append", {
        role: "user",
        content: "hello",
      }),
    );
    expect(append.status).toBe(200);

    const recent = await server.fetch(authedReq("GET", "/memory/conv-1/recent"));
    expect(recent.status).toBe(200);
    const body = (await recent.json()) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages.length).toBe(1);
    expect(body.messages[0]?.content).toBe("hello");
  });

  it("returns rag context using vector backend", async () => {
    const vector = new StubVectorSearch({
      "billing question": [{ id: "doc-1", text: "Plans cost X", score: 0.9 }],
    });
    const memory = new ConversationMemory({ vector });
    const server = buildServer({ memory, vector });
    const res = await server.fetch(
      authedReq("POST", "/memory/conv-1/rag", { query: "billing question", topK: 1 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Array<{ id: string }> };
    expect(body.matches.length).toBe(1);
    expect(body.matches[0]?.id).toBe("doc-1");
  });

  it("rejects bad limit on /recent", async () => {
    const server = buildServer();
    const res = await server.fetch(
      authedReq("GET", "/memory/conv-1/recent?limit=99999"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid append payload", async () => {
    const server = buildServer();
    const res = await server.fetch(
      authedReq("POST", "/memory/conv-1/append", { role: "alien", content: "" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP handler — unknown route", () => {
  it("returns 404 for unmatched routes", async () => {
    const server = buildServer();
    const res = await server.fetch(authedReq("POST", "/nope"));
    expect(res.status).toBe(404);
  });
});

describe("createVoiceAgentSession", () => {
  it("requires an LLM client", () => {
    const server = buildServer();
    expect(() => server.createVoiceAgentSession(() => {})).toThrow();
  });

  it("returns a session when LLM is wired up", () => {
    const llm = new StubLlmClient();
    const server = buildServer({ llm });
    const session = server.createVoiceAgentSession(() => {});
    expect(session.stats().turnsCompleted).toBe(0);
  });
});
