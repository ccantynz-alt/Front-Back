// ── Provider Dispatch ─────────────────────────────────────────────────
// One place that knows how to invoke any provider. Keeps `index.ts`
// free of provider-specific switch statements.

import { callAnthropic } from "./providers/anthropic";
import { callGoogle } from "./providers/google";
import { callGroq } from "./providers/groq";
import { callMistral } from "./providers/mistral";
import { callOpenAI } from "./providers/openai";
import type {
  GatewayChatRequest,
  ProviderInvocationResult,
  ProviderName,
} from "./types";

export interface DispatchOptions {
  apiKey: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Invoke the named provider and return the normalised result. The webgpu
 * "provider" is intentionally NOT dispatched here — it has a separate
 * record endpoint in `index.ts` because it doesn't make a network call.
 */
export async function dispatch(
  provider: Exclude<ProviderName, "webgpu">,
  req: GatewayChatRequest,
  opts: DispatchOptions,
): Promise<ProviderInvocationResult> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(req, opts);
    case "openai":
      return callOpenAI(req, opts);
    case "google":
      return callGoogle(req, opts);
    case "groq":
      return callGroq(req, opts);
    case "mistral":
      return callMistral(req, opts);
    default: {
      const _exhaustive: never = provider;
      return {
        ok: false,
        status: 500,
        errorBody: `unknown provider: ${String(_exhaustive)}`,
      };
    }
  }
}
