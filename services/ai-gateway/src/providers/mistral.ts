// ── Mistral Provider Adapter ──────────────────────────────────────────
// La Plateforme exposes an OpenAI-compatible chat completions endpoint.

import type {
  GatewayChatRequest,
  GatewayChatResponse,
  ProviderAdapterOptions,
  ProviderInvocationResult,
} from "../types";

export const MISTRAL_DEFAULT_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

export type MistralAdapterOptions = ProviderAdapterOptions;

interface MistralResponseBody {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: GatewayChatResponse["choices"];
  usage?: GatewayChatResponse["usage"];
}

function normaliseModelId(model: string): string {
  return model.toLowerCase().startsWith("mistral/") ? model.slice("mistral/".length) : model;
}

export async function callMistral(
  req: GatewayChatRequest,
  opts: MistralAdapterOptions,
): Promise<ProviderInvocationResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = opts.endpoint ?? MISTRAL_DEFAULT_ENDPOINT;
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

  const parsed = (await res.json()) as MistralResponseBody;
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
