// ── Email Intelligence v1 ─────────────────────────────────────────────
// AI-native moat-extender no email provider can retrofit. Four modules:
//   1. Spam-risk scorer        — POST /score-spam
//   2. Subject-line optimiser  — POST /optimise-subject
//   3. Send-time optimiser     — POST /optimise-send-time
//   4. A/B variant scorer      — POST /score-variants
//
// All endpoints bearer-auth via EMAIL_INTELLIGENCE_TOKEN.

import {
  HttpAiGatewayClient,
  type LlmClient,
} from "./llm-client";
import {
  type SendTimeInput,
  optimiseSendTime,
  sendTimeInputSchema,
} from "./send-time-optimiser";
import {
  scoreSpam,
  type ScoreSpamOptions,
  spamScoreInputSchema,
} from "./spam-scorer";
import {
  optimiseSubject,
  type OptimiseSubjectOptions,
  subjectOptimiseInputSchema,
} from "./subject-optimiser";
import {
  scoreVariants,
  type ScoreVariantsOptions,
  scoreVariantsInputSchema,
} from "./variant-scorer";

export interface EmailIntelligenceDeps {
  /** Pluggable LLM client. Pass `undefined` to disable LLM features. */
  llm?: LlmClient | undefined;
  env: {
    EMAIL_INTELLIGENCE_TOKEN?: string | undefined;
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

function authenticate(req: Request, deps: EmailIntelligenceDeps): Response | null {
  const expected = deps.env.EMAIL_INTELLIGENCE_TOKEN;
  if (!expected) {
    return errorResponse(503, "service not configured: EMAIL_INTELLIGENCE_TOKEN missing");
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

async function readJson(req: Request): Promise<{ ok: true; value: unknown } | Response> {
  try {
    const value = await req.json();
    return { ok: true, value };
  } catch {
    return errorResponse(400, "invalid JSON body");
  }
}

export function buildHandler(
  deps: EmailIntelligenceDeps,
): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse(
        { status: "ok", service: "email-intelligence", version: "1.0.0" },
        200,
      );
    }

    if (req.method !== "POST") {
      return errorResponse(405, "method not allowed");
    }

    const authFailed = authenticate(req, deps);
    if (authFailed) {
      return authFailed;
    }

    const body = await readJson(req);
    if (body instanceof Response) {
      return body;
    }

    switch (url.pathname) {
      case "/score-spam": {
        const parsed = spamScoreInputSchema.safeParse(body.value);
        if (!parsed.success) {
          return errorResponse(400, `invalid input: ${parsed.error.message}`);
        }
        const opts: ScoreSpamOptions = {};
        if (deps.llm) {
          opts.llm = deps.llm;
        }
        const result = await scoreSpam(parsed.data, opts);
        return jsonResponse(result, 200);
      }
      case "/optimise-subject": {
        const parsed = subjectOptimiseInputSchema.safeParse(body.value);
        if (!parsed.success) {
          return errorResponse(400, `invalid input: ${parsed.error.message}`);
        }
        const opts: OptimiseSubjectOptions = {};
        if (deps.llm) {
          opts.llm = deps.llm;
        }
        const result = await optimiseSubject(parsed.data, opts);
        return jsonResponse(result, 200);
      }
      case "/optimise-send-time": {
        const parsed = sendTimeInputSchema.safeParse(body.value);
        if (!parsed.success) {
          return errorResponse(400, `invalid input: ${parsed.error.message}`);
        }
        const result = optimiseSendTime(parsed.data as SendTimeInput);
        return jsonResponse(result, 200);
      }
      case "/score-variants": {
        const parsed = scoreVariantsInputSchema.safeParse(body.value);
        if (!parsed.success) {
          return errorResponse(400, `invalid input: ${parsed.error.message}`);
        }
        const opts: ScoreVariantsOptions = {};
        if (deps.llm) {
          opts.llm = deps.llm;
        }
        const result = await scoreVariants(parsed.data, opts);
        return jsonResponse(result, 200);
      }
      default:
        return errorResponse(404, `route not found: ${url.pathname}`);
    }
  };
}

// Re-export the public API surface for unit tests.
export { scoreSpam, heuristicSpamScore } from "./spam-scorer";
export { optimiseSubject, predictOpenRate } from "./subject-optimiser";
export { optimiseSendTime, aggregateHistory } from "./send-time-optimiser";
export { scoreVariants } from "./variant-scorer";
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
  const port = Number(process.env["EMAIL_INTELLIGENCE_PORT"] ?? "9094");
  const gatewayUrl = process.env["AI_GATEWAY_URL"];
  const gatewayToken = process.env["AI_GATEWAY_TOKEN"];
  let llm: LlmClient | undefined;
  if (gatewayUrl && gatewayToken) {
    llm = new HttpAiGatewayClient({
      baseUrl: gatewayUrl,
      token: gatewayToken,
    });
  }
  const handler = buildHandler({
    llm,
    env: {
      EMAIL_INTELLIGENCE_TOKEN: process.env["EMAIL_INTELLIGENCE_TOKEN"],
    },
  });
  Bun.serve({
    fetch: handler,
    port,
    hostname: "127.0.0.1",
  });
  console.log(`[email-intelligence] v1.0.0 listening on http://127.0.0.1:${port}`);
  console.log(
    "[email-intelligence] modules: spam-score, subject-optimise, send-time-optimise, variant-score",
  );
}
