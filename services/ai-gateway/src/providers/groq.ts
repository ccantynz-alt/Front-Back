// ── Groq Provider Adapter ─────────────────────────────────────────────
// Groq's chat completions API is OpenAI-compatible, so this is mostly a
// thin re-skin of the OpenAI adapter pointed at a different endpoint.

import type {
  GatewayChatRequest,
  GatewayChatResponse,
  ProviderAdapterOptions,
  ProviderInvocationResult,
} from "../types";

export const GROQ_DEFAULT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export type GroqAdapterOptions = ProviderAdapterOptions;

interface GroqResponseBody {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: GatewayChatResponse["choices"];
  usage?: GatewayChatResponse["usage"];
}

function normaliseModelId(model: string): string {
  return model.toLowerCase().startsWith("groq/") ? model.slice("groq/".length) : model;
}

export async function callGroq(
  req: GatewayChatRequest,
  opts: GroqAdapterOptions,
): Promise<ProviderInvocationResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = opts.endpoint ?? GROQ_DEFAULT_ENDPOINT;
  const modelId = normaliseModelId(req.model);

  const body: Record<string, unknown> = {
    model: modelId,
    messages: req.messages,
    ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
    ...(req.temperature !== undefined && { temperature: req.temperature }),
  };

  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      ...(opts.signal !== undefined && { signal: opts.signal }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorBody: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const errorBody = await safeReadText(res);
    return { ok: false, status: res.status, errorBody };
  }

  const parsed = (await res.json()) as GroqResponseBody;
  const usage = parsed.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  const response: GatewayChatResponse = {
    id: parsed.id ?? `gw_${Date.now()}`,
    object: "chat.completion",
    created: parsed.created ?? Math.floor(Date.now() / 1000),
    model: parsed.model ?? modelId,
    choices: parsed.choices ?? [],
    usage,
  };

  return { ok: true, status: res.status, response };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
