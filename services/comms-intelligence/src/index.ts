// ── Comms Intelligence v1 ────────────────────────────────────────────
// AI-native moat-extender no telephony provider can retrofit. Four modules:
//   1. AI voice agent          — WS /voice-agent (bidirectional audio)
//   2. Fraud scorer            — POST /score-fraud
//   3. Conversational memory   — POST /memory/:conversationId/append
//                                 GET  /memory/:conversationId/recent
//                                 POST /memory/:conversationId/rag
//   4. Sentiment + intent      — POST /classify
//
// All endpoints bearer-auth via COMMS_INTELLIGENCE_TOKEN.

import {
  type ClassifyOptions,
  classify,
  classifyInputSchema,
} from "./classifier";
import {
  type ScoreFraudOptions,
  fraudInputSchema,
  scoreFraud,
} from "./fraud-scorer";
import { HttpAiGatewayClient, type LlmClient } from "./llm-client";
import {
  ConversationMemory,
  memoryAppendSchema,
  memoryRagSchema,
  type VectorSearch,
} from "./memory";
import {
  StubSttClient,
  StubTtsClient,
  type SttClient,
  type TtsClient,
  VoiceAgentSession,
  type VoiceAgentInbound,
  type VoiceAgentOutbound,
} from "./voice-agent";

export interface CommsIntelligenceDeps {
  llm?: LlmClient | undefined;
  vector?: VectorSearch | undefined;
  stt?: SttClient | undefined;
  tts?: TtsClient | undefined;
  memory?: ConversationMemory | undefined;
  env: {
    COMMS_INTELLIGENCE_TOKEN?: string | undefined;
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

function authenticate(req: Request, deps: CommsIntelligenceDeps): Response | null {
  const expected = deps.env.COMMS_INTELLIGENCE_TOKEN;
  if (!expected) {
    return errorResponse(503, "service not configured: COMMS_INTELLIGENCE_TOKEN missing");
  }
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return errorResponse(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) {
    return errorResponse(401, "empty bearer token");
  }
  if (token !== expected) {
    return errorResponse(401, "invalid bearer token");
  }
  return null;
}

async function readJson(
  req: Request,
): Promise<{ ok: true; value: unknown } | Response> {
  try {
    const value = await req.json();
    return { ok: true, value };
  } catch {
    return errorResponse(400, "invalid JSON body");
  }
}

interface RouteContext {
  memory: ConversationMemory;
  llm: LlmClient | undefined;
  vector: VectorSearch | undefined;
}

function makeContext(deps: CommsIntelligenceDeps): RouteContext {
  return {
    memory: deps.memory ?? new ConversationMemory({ ...(deps.vector !== undefined && { vector: deps.vector }) }),
    llm: deps.llm,
    vector: deps.vector,
  };
}

export interface CommsIntelligenceServer {
  fetch: (req: Request) => Promise<Response>;
  context: RouteContext;
  /** Build a voice-agent session bound to a peer-side `send` callback. */
  createVoiceAgentSession: (
    send: (msg: VoiceAgentOutbound) => void,
  ) => VoiceAgentSession;
}

export function buildHandler(
  deps: CommsIntelligenceDeps,
): CommsIntelligenceServer {
  const ctx = makeContext(deps);
  const stt = deps.stt ?? new StubSttClient();
  const tts = deps.tts ?? new StubTtsClient();

  async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse(
        {
          status: "ok",
          service: "comms-intelligence",
          version: "1.0.0",
          modules: ["voice-agent", "fraud", "memory", "classify"],
        },
        200,
      );
    }

    const authFailed = authenticate(req, deps);
    if (authFailed) {
      return authFailed;
    }

    // ── /score-fraud ────────────────────────────────────────────
    if (req.method === "POST" && url.pathname === "/score-fraud") {
      const body = await readJson(req);
      if (body instanceof Response) return body;
      const parsed = fraudInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return errorResponse(400, `invalid input: ${parsed.error.message}`);
      }
      const opts: ScoreFraudOptions = {};
      if (ctx.llm) opts.llm = ctx.llm;
      const result = await scoreFraud(parsed.data, opts);
      return jsonResponse(result, 200);
    }

    // ── /classify ───────────────────────────────────────────────
    if (req.method === "POST" && url.pathname === "/classify") {
      const body = await readJson(req);
      if (body instanceof Response) return body;
      const parsed = classifyInputSchema.safeParse(body.value);
      if (!parsed.success) {
        return errorResponse(400, `invalid input: ${parsed.error.message}`);
      }
      const opts: ClassifyOptions = {};
      if (ctx.llm) opts.llm = ctx.llm;
      const result = await classify(parsed.data, opts);
      return jsonResponse(result, 200);
    }

    // ── /memory/:conversationId/* ──────────────────────────────
    const memoryMatch = url.pathname.match(
      /^\/memory\/([^/]+)\/(append|recent|rag)$/,
    );
    if (memoryMatch) {
      const conversationId = decodeURIComponent(memoryMatch[1] ?? "");
      const action = memoryMatch[2];
      if (!conversationId) {
        return errorResponse(400, "conversationId required");
      }

      if (action === "append") {
        if (req.method !== "POST") return errorResponse(405, "method not allowed");
        const body = await readJson(req);
        if (body instanceof Response) return body;
        const parsed = memoryAppendSchema.safeParse(body.value);
        if (!parsed.success) {
          return errorResponse(400, `invalid input: ${parsed.error.message}`);
        }
        const stored = ctx.memory.appendMessage(conversationId, parsed.data);
        return jsonResponse({ ok: true, message: stored }, 200);
      }

      if (action === "recent") {
        if (req.method !== "GET") return errorResponse(405, "method not allowed");
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
        if (Number.isNaN(limit) || limit < 1 || limit > 200) {
          return errorResponse(400, "limit must be 1..200");
        }
        const messages = ctx.memory.getRecentMessages(conversationId, limit);
        return jsonResponse({ ok: true, messages }, 200);
      }

      if (action === "rag") {
        if (req.method !== "POST") return errorResponse(405, "method not allowed");
        const body = await readJson(req);
        if (body instanceof Response) return body;
        const parsed = memoryRagSchema.safeParse(body.value);
        if (!parsed.success) {
          return errorResponse(400, `invalid input: ${parsed.error.message}`);
        }
        const tenantId = req.headers.get("x-tenant-id") ?? undefined;
        const result = await ctx.memory.getRagContext(
          conversationId,
          parsed.data,
          tenantId,
        );
        return jsonResponse({ ok: true, ...result }, 200);
      }
    }

    return errorResponse(404, `route not found: ${url.pathname}`);
  }

  function createVoiceAgentSession(
    send: (msg: VoiceAgentOutbound) => void,
  ): VoiceAgentSession {
    if (!ctx.llm) {
      throw new Error("voice-agent requires an LLM client");
    }
    return new VoiceAgentSession(
      {
        stt,
        tts,
        llm: ctx.llm,
        memory: ctx.memory,
      },
      send,
    );
  }

  return { fetch: fetchHandler, context: ctx, createVoiceAgentSession };
}

// Re-export the public API surface for unit tests.
export {
  scoreFraud,
  heuristicFraudScore,
  type FraudInput,
  type FraudScoreResult,
  type FraudSignal,
  type FraudDecision,
} from "./fraud-scorer";
export {
  classify,
  heuristicClassify,
  type ClassifyInput,
  type ClassifyResult,
  type Sentiment,
  type Intent,
} from "./classifier";
export {
  ConversationMemory,
  StubVectorSearch,
  type MemoryMessage,
  type MemoryAppend,
  type MemoryRagQuery,
  type RagDocument,
  type VectorSearch,
} from "./memory";
export {
  VoiceAgentSession,
  StubSttClient,
  StubTtsClient,
  type VoiceAgentInbound,
  type VoiceAgentOutbound,
  type SttClient,
  type TtsClient,
} from "./voice-agent";
export {
  HttpAiGatewayClient,
  StubLlmClient,
  type LlmClient,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
} from "./llm-client";

// ── Bootstrap ─────────────────────────────────────────────────────────

const isEntrypoint = import.meta.main;
if (isEntrypoint) {
  const port = Number(process.env["COMMS_INTELLIGENCE_PORT"] ?? "9095");
  const gatewayUrl = process.env["AI_GATEWAY_URL"];
  const gatewayToken = process.env["AI_GATEWAY_TOKEN"];
  let llm: LlmClient | undefined;
  if (gatewayUrl && gatewayToken) {
    llm = new HttpAiGatewayClient({
      baseUrl: gatewayUrl,
      token: gatewayToken,
    });
  }
  const server = buildHandler({
    ...(llm !== undefined && { llm }),
    env: {
      COMMS_INTELLIGENCE_TOKEN: process.env["COMMS_INTELLIGENCE_TOKEN"],
    },
  });

  Bun.serve({
    fetch(req: Request, srv): Response | Promise<Response> | undefined {
      const url = new URL(req.url);
      if (url.pathname === "/voice-agent") {
        const expected = process.env["COMMS_INTELLIGENCE_TOKEN"];
        const tokenHeader = req.headers.get("authorization") ?? "";
        if (!expected || !tokenHeader.startsWith("Bearer ") || tokenHeader.slice(7).trim() !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const upgraded = srv.upgrade(req);
        if (upgraded) return undefined;
        return new Response("websocket upgrade failed", { status: 426 });
      }
      return server.fetch(req);
    },
    websocket: {
      open(ws) {
        const session = server.createVoiceAgentSession((msg) => {
          ws.send(JSON.stringify(msg));
        });
        (ws as unknown as { data: { session: VoiceAgentSession } }).data = { session };
      },
      async message(ws, raw) {
        const wsd = ws as unknown as { data: { session: VoiceAgentSession } };
        const session = wsd.data?.session;
        if (!session) return;
        let parsed: VoiceAgentInbound;
        try {
          parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as VoiceAgentInbound;
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
          return;
        }
        await session.handleInbound(parsed);
      },
    },
    port,
    hostname: "127.0.0.1",
  });
  console.log(`[comms-intelligence] v1.0.0 listening on http://127.0.0.1:${port}`);
  console.log("[comms-intelligence] modules: voice-agent, fraud, memory, classify");
}
