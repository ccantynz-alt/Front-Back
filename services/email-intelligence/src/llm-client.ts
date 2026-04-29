// ── LLM Client Interface ──────────────────────────────────────────────
// Pluggable LLM client. Default impl calls services/ai-gateway over HTTP.
// Tests inject deterministic stub implementations.

export interface LlmCompletionRequest {
  /** A purpose tag the caller provides — e.g. "spam-score", "subject-variants". */
  purpose: string;
  /** Prompt + context, already shaped for the model. */
  prompt: string;
  /** Optional model hint — falls through to gateway routing if omitted. */
  model?: string;
  /** Max tokens for the completion. */
  maxTokens?: number;
  /** 0–1 temperature. */
  temperature?: number;
}

export interface LlmCompletionResponse {
  /** The raw text body returned by the model. */
  text: string;
  /** The provider that served the request (informational). */
  provider?: string | undefined;
  /** Model identifier that produced the text. */
  model?: string | undefined;
}

/**
 * The pluggable LLM-client contract. All four intelligence modules call
 * this when they need a second-opinion / generation pass. In tests, callers
 * pass a stub. In production, the default {@link HttpAiGatewayClient} fans
 * out to services/ai-gateway.
 */
export interface LlmClient {
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

/**
 * Minimal structural type for the fetch impl. Bun's full `typeof fetch`
 * includes a `preconnect` method that is awkward to stub in tests; we only
 * need the call signature, so we narrow it here.
 */
export type FetchLike = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpAiGatewayClientOptions {
  /** Base URL of the ai-gateway service (e.g. http://127.0.0.1:9092). */
  baseUrl: string;
  /** Bearer token for the gateway. */
  token: string;
  /** Optional default model to use when the caller does not specify one. */
  defaultModel?: string;
  /** Override fetch impl for testing. */
  fetchImpl?: FetchLike;
}

/**
 * Production HTTP client that calls the ai-gateway's
 * `/v1/chat/completions` endpoint. v1 always uses the chat shape — we
 * pack the prompt into a single user message.
 */
export class HttpAiGatewayClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultModel: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: HttpAiGatewayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.defaultModel = opts.defaultModel ?? "anthropic/claude-3-5-haiku-latest";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = req.model ?? this.defaultModel;
    const body = {
      model,
      messages: [{ role: "user", content: req.prompt }],
      ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
      ...(req.temperature !== undefined && { temperature: req.temperature }),
    };
    const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
        "x-purpose": req.purpose,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`ai-gateway ${res.status}: ${errBody || "no body"}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      provider?: string;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      text,
      ...(json.model !== undefined && { model: json.model }),
      ...(json.provider !== undefined && { provider: json.provider }),
    };
  }
}

/**
 * A deterministic stub used in tests. Echoes the prompt or returns a
 * caller-provided canned response for a given purpose.
 */
export class StubLlmClient implements LlmClient {
  private readonly responses: Map<string, LlmCompletionResponse>;
  private readonly defaultText: string;
  public callLog: LlmCompletionRequest[] = [];

  constructor(opts?: {
    responses?: Record<string, LlmCompletionResponse | string>;
    defaultText?: string;
  }) {
    this.responses = new Map();
    for (const [k, v] of Object.entries(opts?.responses ?? {})) {
      this.responses.set(k, typeof v === "string" ? { text: v } : v);
    }
    this.defaultText = opts?.defaultText ?? "stub-response";
  }

  // biome-ignore lint/suspicious/useAwait: implements async interface
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.callLog.push(req);
    const canned = this.responses.get(req.purpose);
    if (canned) {
      return canned;
    }
    return { text: this.defaultText };
  }
}
