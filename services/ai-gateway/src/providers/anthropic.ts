// ── Anthropic Provider Adapter ────────────────────────────────────────
// Thin wrapper around the Messages API. Translates the OpenAI-shaped
// gateway request into Anthropic's expected payload. Returns a normalised
// gateway response so router.ts callers don't care which vendor served.

import type { ChatMessage, GatewayChatRequest, GatewayChatResponse } from "../types";

export const ANTHROPIC_DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export interface AnthropicAdapterOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponseBody {
  id?: string;
  model?: string;
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export type ProviderInvocationResult =
  | { ok: true; status: number; response: GatewayChatResponse }
  | { ok: false; status: number; errorBody: string };

function splitSystemAndUserMessages(messages: ChatMessage[]): {
  system: string | undefined;
  rest: { role: "user" | "assistant"; content: string }[];
} {
  let system: string | undefined;
  const rest: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system = system === undefined ? m.content : `${system}\n\n${m.content}`;
    } else if (m.role === "user" || m.role === "assistant") {
      rest.push({ role: m.role, content: m.content });
    }
  }
  return { system, rest };
}

export async function callAnthropic(
  req: GatewayChatRequest,
  opts: AnthropicAdapterOptions,
): Promise<ProviderInvocationResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = opts.endpoint ?? ANTHROPIC_DEFAULT_ENDPOINT;
  const { system, rest } = splitSystemAndUserMessages(req.messages);

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 1024,
    messages: rest,
    ...(system !== undefined && { system }),
    ...(req.temperature !== undefined && { temperature: req.temperature }),
  };

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await safeReadText(res);
    return { ok: false, status: res.status, errorBody };
  }

  const parsed = (await res.json()) as AnthropicResponseBody;
  const text = (parsed.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("");

  const inputTokens = parsed.usage?.input_tokens ?? 0;
  const outputTokens = parsed.usage?.output_tokens ?? 0;

  const response: GatewayChatResponse = {
    id: parsed.id ?? `gw_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: parsed.model ?? req.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
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
