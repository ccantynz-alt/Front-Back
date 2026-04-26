// ── OpenAI Provider Adapter ───────────────────────────────────────────
// Thin wrapper around /v1/chat/completions. The gateway response is
// already in OpenAI's wire shape, so this is mostly passthrough.

import type { GatewayChatRequest, GatewayChatResponse } from "../types";
import type { ProviderInvocationResult } from "./anthropic";

export const OPENAI_DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface OpenAIAdapterOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAIResponseBody {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: GatewayChatResponse["choices"];
  usage?: GatewayChatResponse["usage"];
}

export async function callOpenAI(
  req: GatewayChatRequest,
  opts: OpenAIAdapterOptions,
): Promise<ProviderInvocationResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = opts.endpoint ?? OPENAI_DEFAULT_ENDPOINT;

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
    ...(req.temperature !== undefined && { temperature: req.temperature }),
  };

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await safeReadText(res);
    return { ok: false, status: res.status, errorBody };
  }

  const parsed = (await res.json()) as OpenAIResponseBody;
  const usage = parsed.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  const response: GatewayChatResponse = {
    id: parsed.id ?? `gw_${Date.now()}`,
    object: "chat.completion",
    created: parsed.created ?? Math.floor(Date.now() / 1000),
    model: parsed.model ?? req.model,
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
