// ── Google Gemini Provider Adapter ────────────────────────────────────
// Wraps the Generative Language API (`generateContent`). Translates the
// OpenAI-shaped gateway request into Gemini's expected payload and
// normalises the response back to the OpenAI wire shape.

import type {
  ChatMessage,
  GatewayChatRequest,
  GatewayChatResponse,
  ProviderAdapterOptions,
  ProviderInvocationResult,
} from "../types";

export const GOOGLE_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type GoogleAdapterOptions = ProviderAdapterOptions;

interface GoogleContentPart {
  text?: string;
}

interface GoogleCandidate {
  content?: { parts?: GoogleContentPart[]; role?: string };
  finishReason?: string;
}

interface GoogleResponseBody {
  candidates?: GoogleCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
}

interface GoogleRequestContent {
  role: "user" | "model";
  parts: { text: string }[];
}

function toGoogleContents(messages: ChatMessage[]): {
  systemInstruction: { parts: { text: string }[] } | undefined;
  contents: GoogleRequestContent[];
} {
  let system: string | undefined;
  const contents: GoogleRequestContent[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system = system === undefined ? m.content : `${system}\n\n${m.content}`;
      continue;
    }
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: m.content }] });
  }
  return {
    systemInstruction:
      system === undefined ? undefined : { parts: [{ text: system }] },
    contents,
  };
}

/**
 * Strip a `google/` or `gemini/` prefix from the model id so Gemini's
 * REST endpoint receives the bare model name (e.g. `gemini-1.5-pro`).
 */
function normaliseModelId(model: string): string {
  const lower = model.toLowerCase();
  if (lower.startsWith("google/")) {
    return model.slice("google/".length);
  }
  if (lower.startsWith("gemini/")) {
    return model.slice("gemini/".length);
  }
  return model;
}

export async function callGoogle(
  req: GatewayChatRequest,
  opts: GoogleAdapterOptions,
): Promise<ProviderInvocationResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.endpoint ?? GOOGLE_DEFAULT_BASE;
  const modelId = normaliseModelId(req.model);
  const endpoint = `${base}/${encodeURIComponent(modelId)}:generateContent`;

  const { systemInstruction, contents } = toGoogleContents(req.messages);
  const body: Record<string, unknown> = {
    contents,
    ...(systemInstruction !== undefined && { systemInstruction }),
    generationConfig: {
      ...(req.maxTokens !== undefined && { maxOutputTokens: req.maxTokens }),
      ...(req.temperature !== undefined && { temperature: req.temperature }),
    },
  };

  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": opts.apiKey,
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

  const parsed = (await res.json()) as GoogleResponseBody;
  const candidate = parsed.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");

  const inputTokens = parsed.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = parsed.usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens = parsed.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

  const response: GatewayChatResponse = {
    id: `gw_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: parsed.modelVersion ?? modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: candidate?.finishReason?.toLowerCase() ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
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
