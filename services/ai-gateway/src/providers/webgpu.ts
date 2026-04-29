// ── WebGPU Passthrough "Provider" ─────────────────────────────────────
// This is NOT an upstream HTTP provider — it's a virtual sink that
// records WebGPU/WebLLM client-side inferences for billing and audit.
// The customer's browser ran the inference for free on the user's GPU;
// the gateway only sees the result + token counts the client reports.
//
// Endpoint: POST /v1/webgpu/record
// Auth: same per-customer API key as the chat endpoint.
//
// This is the cost-advantage flywheel from CLAUDE.md §3:
//   - WebGPU inference is $0/token to the platform.
//   - We still charge the customer at their plan rate (heavily discounted).
//   - The delta is the moat. Vercel/Cloudflare AI Gateway can't do this
//     because they don't ship a client-side runtime.

import { z } from "zod";
import type {
  GatewayChatResponse,
  ProviderInvocationResult,
} from "../types";

export const webgpuRecordSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  output: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Wall-clock latency reported by the client, milliseconds. */
  latencyMs: z.number().nonnegative().optional(),
  /** Optional: the WebGPU adapter / device label, for fleet observability. */
  device: z.string().optional(),
});

export type WebGPURecord = z.infer<typeof webgpuRecordSchema>;

/**
 * Synthesise a `GatewayChatResponse` from a client-reported WebGPU
 * inference. We trust the client's token counts (they're the ones who
 * ran the model); a future hardening step is to recompute via tokeniser
 * but that's a v2 concern.
 */
export function synthesiseWebGPUResponse(rec: WebGPURecord): GatewayChatResponse {
  const total = rec.inputTokens + rec.outputTokens;
  return {
    id: `gw_webgpu_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: rec.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: rec.output },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: rec.inputTokens,
      completion_tokens: rec.outputTokens,
      total_tokens: total,
    },
  };
}

/**
 * `callWebGPU` is the dispatcher hook. It doesn't make a network call —
 * it just wraps a pre-supplied client record so the gateway can put it
 * through the same caching/usage pipeline as remote providers.
 */
export function callWebGPU(rec: WebGPURecord): ProviderInvocationResult {
  return {
    ok: true,
    status: 200,
    response: synthesiseWebGPUResponse(rec),
  };
}
