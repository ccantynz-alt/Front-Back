/**
 * Shared fixtures for the AI Gateway tests. Kept in a non-`*.test.ts`
 * file so it does NOT count toward Bun's test discovery and so the
 * file-length cap on each test file stays under the codeQuality
 * threshold.
 *
 * NOT exported from `index.ts` — this is internal test scaffolding.
 */

import type {
  ProviderCallInput,
  ProviderCallResult,
  ProviderCaller,
} from "./providers";

// Synthetic test fixture — NOT a real credential. Constructed to avoid
// secret-detector false positives (no recognised API-key prefix).
export const BEARER = ["fake", "test", "bearer", "value"].join("-");
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const OPENAI_MODEL = "gpt-4o-mini";

export interface RecordedCall {
  provider: string;
  model: string;
  messages: ProviderCallInput["messages"];
}

export function recordingCaller(
  responder: (call: RecordedCall) => Promise<ProviderCallResult> | ProviderCallResult,
): { caller: ProviderCaller; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const caller: ProviderCaller = async (input) => {
    const recorded: RecordedCall = {
      provider: input.provider,
      model: input.model,
      messages: input.messages,
    };
    calls.push(recorded);
    return await responder(recorded);
  };
  return { caller, calls };
}

export function validBody(
  overrides: Partial<Record<string, unknown>> = {},
): string {
  return JSON.stringify({
    model: ANTHROPIC_MODEL,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hi." },
    ],
    temperature: 0.4,
    max_tokens: 64,
    ...overrides,
  });
}

export function makeRequest(
  body: string,
  opts: { auth?: string; ttl?: number } = {},
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== undefined) headers["Authorization"] = opts.auth;
  if (opts.ttl !== undefined) headers["x-cache-ttl"] = String(opts.ttl);
  return new Request("http://localhost/ai/gateway/v1/chat/completions", {
    method: "POST",
    headers,
    body,
  });
}

export const happy = (
  overrides: Partial<ProviderCallResult> = {},
): ProviderCallResult => ({
  content: "hello there",
  promptTokens: 12,
  completionTokens: 7,
  finishReason: "stop",
  ...overrides,
});
