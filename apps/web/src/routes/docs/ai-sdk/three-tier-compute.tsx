// ── /docs/ai-sdk/three-tier-compute — the core router ───────────────
//
// Deep-dives the real compute-tier router in
// packages/ai-core/src/compute-tier.ts. Describes computeTierRouter(),
// computeTierWithReason(), the WASM fast-path, the three tier branches,
// the selectCloudModel() / buildCloudRequest() helpers, and the
// ComputeTier Zod enum. Every reference is a real export — no invented
// helpers. Cites apps/api/src/ai/chat-stream.ts for the concrete
// server-side consumer so readers can trace from the doc to the code.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function ThreeTierComputeArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Three-tier compute routing"
        description="How computeTierRouter picks client GPU, edge, or cloud per request. The real router code, the device-capability probe, and the fallback chain from packages/ai-core/src/compute-tier.ts."
        path="/docs/ai-sdk/three-tier-compute"
      />

      <DocsArticle
        eyebrow="AI SDK"
        title="Three-tier compute routing"
        subtitle="Every AI request on Crontech is routed by a pure function. It takes a DeviceCapabilities object and a ModelRequirements object and returns one of three tiers: client, edge, or cloud. Here is exactly how it decides."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "Streaming completions",
          href: "/docs/ai-sdk/streaming-completions",
          description:
            "Now that you know how the router picks a tier, see how the streaming path turns that decision into a live token stream over SSE.",
        }}
      >
        <p>
          The router lives in a single file —{" "}
          <code>packages/ai-core/src/compute-tier.ts</code> — and exports
          a pure function named{" "}
          <code>computeTierRouter</code>. It takes a{" "}
          <code>DeviceCapabilities</code> object (WebGPU yes/no, VRAM,
          network class) and a <code>ModelRequirements</code> object
          (parameters in billions, minimum VRAM, maximum latency) and
          returns a <code>ComputeTier</code> — one of{" "}
          <code>"client"</code>, <code>"edge"</code>, or{" "}
          <code>"cloud"</code>.
        </p>

        <Callout tone="info" title="Why three tiers">
          Each tier is a cost / latency / capability trade-off. Client
          GPU is free per token and the lowest latency, but is capped at
          models that fit in the user's VRAM. Edge is cheap and sub-50ms
          globally but limited to ~7B params. Cloud is the full-power
          fallback — Modal.com H100s running Llama 3.1 70B or Mixtral
          8x7B. The router picks the cheapest tier that meets the
          request.
        </Callout>

        <h2>The tier enum</h2>
        <p>
          <code>ComputeTier</code> is a Zod enum. The source of truth
          for the three strings is <code>ComputeTierSchema</code>, and{" "}
          <code>isComputeTier()</code> is the runtime guard you use when
          pulling a tier hint off a URL param or a telemetry event.
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`export const ComputeTierSchema = z.enum(["client", "edge", "cloud"]);
export type ComputeTier = z.infer<typeof ComputeTierSchema>;

export function isComputeTier(value: unknown): value is ComputeTier {
  return ComputeTierSchema.safeParse(value).success;
}`}</code>
        </pre>

        <h2>The four routing branches</h2>

        <p>
          <code>computeTierRouter()</code> has four branches, in this
          order:
        </p>

        <KeyList
          items={[
            {
              term: "Tier 0 — WASM client (lightweight ML)",
              description:
                "If the task is embeddings, classification, summarization, or feature-extraction, and the model is ≤ 1B params, and either WebGPU or plain WASM is present, the request runs client-side via Transformers.js. This fires even on devices without a GPU.",
            },
            {
              term: "Tier 1 — WebGPU client (chat / generation)",
              description:
                "If the device has WebGPU, enough VRAM to hold the model, the model is ≤ 2B params, and the latency budget is at least 10ms, the request runs client-side via WebLLM. This is the $0/token path for chat.",
            },
            {
              term: "Tier 2 — edge",
              description:
                "If the model is ≤ 7B params and the latency budget is at least 50ms, the request runs on the edge through the provider factory's edge model (OpenAI-compatible, configurable via AI_EDGE_MODEL).",
            },
            {
              term: "Tier 3 — cloud fallback",
              description:
                "Anything that doesn't fit the first three branches runs on Modal.com GPU workers. selectCloudModel() maps parameter counts to concrete model IDs: ≤ 30B gets Mixtral 8x7B, > 30B gets Llama 3.1 70B on dual A100s.",
            },
          ]}
        />

        <Callout tone="note">
          The router is pure. It never fetches, never probes, never
          throws. You pass it two objects, it returns a string. That
          purity is what lets the same router run identically on the
          server (picking a tier before the request goes out) and in
          the browser (picking a tier for a client-initiated call).
        </Callout>

        <h2>Device capabilities</h2>

        <p>
          The <code>DeviceCapabilities</code> input describes what the
          runtime can do:
        </p>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`export interface DeviceCapabilities {
  hasWebGPU: boolean;
  vramMB: number;
  hardwareConcurrency: number;
  deviceMemoryGB: number;
  connectionType: "4g" | "3g" | "2g" | "slow-2g" | "wifi" | "ethernet" | "unknown";
  hasWASM?: boolean;
}`}</code>
        </pre>

        <p>
          On the client,{" "}
          <code>getClientCapabilities()</code> in{" "}
          <code>packages/ai-core/src/inference/index.ts</code> fills in
          a matching{" "}
          <code>ClientCapabilities</code> from <code>navigator.gpu</code>,{" "}
          <code>navigator.deviceMemory</code>, and a WASM feature-check.
          On the server the caller constructs the object from whatever
          signal it has — typically the user-agent hint or a cached
          capability row from a previous session.
        </p>

        <h2>Model requirements</h2>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`export interface ModelRequirements {
  parametersBillion: number;
  minVRAMMB: number;
  latencyMaxMs: number;
  task?: InferenceTask;
}`}</code>
        </pre>

        <p>
          The <code>task</code> hint is what unlocks the WASM fast-path.
          An embeddings call with a 0.1B model and a 10ms budget routes
          to the client even on a low-end laptop with no GPU, because
          Transformers.js can run the pipeline in WASM. A general chat
          call with no task hint skips that branch and lands on tier 1
          or below.
        </p>

        <h2>Getting a reason with the decision</h2>

        <p>
          When you need to log or surface <em>why</em> the router picked
          a tier — for debugging, for observability, for a dashboard
          badge — use{" "}
          <code>computeTierWithReason()</code> instead. It returns{" "}
          <code>{`{ tier, reason }`}</code> with a human-readable
          explanation of the choice:
        </p>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`const { tier, reason } = computeTierWithReason(device, model);
// tier === "cloud"
// reason === "Cloud GPU required: model 70B exceeds edge 7B limit.
//             Routing to Modal.com llama-3.1-70b."`}</code>
        </pre>

        <h2>From tier to a cloud GPU request</h2>

        <p>
          If the decision is <code>"cloud"</code>, the request needs to
          be translated into a Modal.com GPU worker call. Two helpers
          do that work:
        </p>

        <KeyList
          items={[
            {
              term: "selectCloudModel(parametersBillion)",
              description:
                "Maps a parameter count to a concrete Modal.com model ID. > 30B → llama-3.1-70b. Otherwise → mixtral-8x7b (a MoE with ~12.9B active params).",
            },
            {
              term: "buildCloudRequest(model, prompt, opts)",
              description:
                "Constructs a CloudInferenceRequest validated against CloudInferenceRequestSchema. Defaults: maxTokens 2048, temperature 0.7, topP 0.9, stream true. Override any of them via opts.",
            },
          ]}
        />

        <p>
          The cloud tier's response shape is also schemaed:{" "}
          <code>CloudInferenceResponseSchema</code> for non-streamed
          responses (with token usage + latency) and{" "}
          <code>CloudStreamChunkSchema</code> for streamed deltas. Both
          carry a literal <code>tier: "cloud"</code> so downstream code
          can tell where the tokens came from.
        </p>

        <h2>Fallover in practice</h2>

        <p>
          The router picks the tier. The provider factory —{" "}
          <code>routeAICall()</code> in{" "}
          <code>packages/ai-core/src/providers.ts</code> — is what
          actually handles a provider failure. It runs the call against
          the primary model, catches the error, classifies it with{" "}
          <code>isRetryableError()</code>, and either:
        </p>

        <KeyList
          items={[
            {
              term: "Propagates the error",
              description:
                "If the error is a 400, 401, 403, 404, or 422 — the caller's fault, not the provider's — the error surfaces immediately. No retry, no extra spend.",
            },
            {
              term: "Retries on the fallback model",
              description:
                "If the error is a 429, 500, 502, 503, 504, or a known timeout / connection-reset pattern, the call runs again against getFallbackModel(). If Anthropic was primary, OpenAI is the fallback (and vice versa).",
            },
          ]}
        />

        <Callout tone="note">
          Fallover is one-hop by design. If the fallback also fails,
          the error surfaces to the caller. This keeps latency bounded
          and avoids pathological retry storms during a wide-scope
          outage.
        </Callout>

        <h2>Where it gets used</h2>
        <p>
          The streaming chat endpoint at{" "}
          <code>POST /chat/stream</code> (<code>apps/api/src/ai/chat-stream.ts</code>)
          is the most visible consumer. It resolves an Anthropic
          language model via <code>getAnthropicModel()</code>, then
          hands it to the Vercel AI SDK's <code>streamText()</code>.
          The site builder's{" "}
          <a href="/docs/api-reference/ai-and-chat">
            <code>ai.siteBuilder.generate</code>
          </a>{" "}
          mutation accepts an optional <code>tier</code> hint and runs
          the router to decide between client, edge, and cloud before
          the provider is picked.
        </p>

        <h2>Worked example</h2>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`import {
  computeTierRouter,
  computeTierWithReason,
  buildCloudRequest,
} from "@back-to-the-future/ai-core";

const device = {
  hasWebGPU: true,
  vramMB: 8192,
  hardwareConcurrency: 8,
  deviceMemoryGB: 16,
  connectionType: "wifi" as const,
};

const model = {
  parametersBillion: 2,
  minVRAMMB: 2048,
  latencyMaxMs: 200,
};

const tier = computeTierRouter(device, model);
// tier === "client" — the user's GPU can take a 2B model

const { reason } = computeTierWithReason(device, model);
// "Device has WebGPU with sufficient VRAM for sub-2B model"

// Same device, bigger model:
const heavy = { ...model, parametersBillion: 70, minVRAMMB: 80_000 };
const heavyTier = computeTierRouter(device, heavy);
// heavyTier === "cloud"

const cloudReq = buildCloudRequest(heavy, "Summarise this document...");
// cloudReq.model === "llama-3.1-70b"`}</code>
        </pre>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "Streaming completions",
              description:
                "The server-side consumer that calls the router for every chat request.",
            },
            {
              term: "Client-GPU inference",
              description:
                "What happens when the router's decision is client — WebLLM, Transformers.js, and the VRAM budget check.",
            },
            {
              term: "AI & Chat procedures",
              description:
                "The tRPC surface that exposes tier-aware generation to the dashboard and to customer clients.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
