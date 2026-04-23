// ── /docs/ai-sdk — AI SDK category overview ─────────────────────────
//
// Landing article for the AI SDK category. Sets the mental model for
// the three-tier compute router, the streaming chat surface, and the
// client-side WebGPU inference path, then hands off to the three
// dedicated articles. Honest about what ships today (the router, the
// /chat/stream Hono route, the WebLLM + Transformers.js client path)
// and what is still behind a flag (multi-agent orchestration, RAG).
// No invented APIs — every reference is a real export from
// packages/ai-core/src/* or a real Hono route under apps/api/src/ai/.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function AiSdkIndexArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="AI SDK"
        description="The Crontech AI SDK: three-tier compute routing, SSE streaming completions, and $0/token WebGPU inference in the browser. Honest map of what ships today."
        path="/docs/ai-sdk"
      />

      <DocsArticle
        eyebrow="AI SDK"
        title="AI SDK"
        subtitle="One SDK, three compute tiers, zero marketing. Crontech routes every inference request to the cheapest tier that meets the request — client GPU when the user's device can take it, the edge when it can't, cloud H100s when neither will do."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "Three-tier compute routing",
          href: "/docs/ai-sdk/three-tier-compute",
          description:
            "Start here. The router is the heart of the SDK — understand it once and every other article snaps into place.",
        }}
      >
        <p>
          The Crontech AI SDK is the layer that turns an AI request into
          an answer. It does not care whether the model runs on the
          user's GPU, on a Cloudflare Workers AI node, or on a Modal.com
          H100 — the router picks a tier per call based on device
          capability, model size, and latency budget. Your application
          code just asks for a completion.
        </p>

        <p>
          Three things sit behind that single API surface:
        </p>

        <KeyList
          items={[
            {
              term: "A compute-tier router",
              description:
                "computeTierRouter() in packages/ai-core/src/compute-tier.ts picks client, edge, or cloud from a DeviceCapabilities and ModelRequirements pair. No hand-wavy heuristics — the code is 30 lines and the branches are documented inline.",
            },
            {
              term: "A provider factory with auto-failover",
              description:
                "routeAICall() in packages/ai-core/src/providers.ts wraps any inference function, running it against the primary provider and automatically retrying on a secondary when the upstream returns 429, 503, or a retryable network error.",
            },
            {
              term: "A client-side inference path",
              description:
                "clientInfer() in packages/ai-core/src/inference/index.ts routes chat tasks to WebLLM (WebGPU-backed LLMs) and ML pipelines (embeddings, classification, summarization) to Transformers.js. Every client-side token costs zero.",
            },
          ]}
        />

        <Callout tone="info" title="How the pieces fit">
          The router is a pure function — it doesn't call anyone. The
          provider factory turns the router's decision into a concrete{" "}
          <code>LanguageModel</code> for the Vercel AI SDK. The client
          inference path runs the decision in the browser when the tier
          is <code>"client"</code>. The streaming endpoint at{" "}
          <code>POST /chat/stream</code> wires all three together for
          server-driven conversations.
        </Callout>

        <h2>What's in this category</h2>

        <KeyList
          items={[
            {
              term: "Three-tier compute routing",
              description:
                "The core architectural decision. Walks through computeTierRouter() and computeTierWithReason(), the device-capability probe, the WASM fast-path for lightweight ML, and the fallback chain.",
            },
            {
              term: "Streaming completions",
              description:
                "How SSE streaming works end-to-end. The POST /chat/stream Hono route, the user-key-vs-env-key resolution, streamText() from the Vercel AI SDK, and how the dashboard consumes the token stream.",
            },
            {
              term: "Client-GPU inference",
              description:
                "The $0/token tier. WebGPU detection, WebLLM for chat, Transformers.js for embeddings and classification, the memory budget the unified entry point enforces, and how the server-side router hands work down to the browser.",
            },
          ]}
        />

        <h2>What the SDK guarantees</h2>

        <KeyList
          items={[
            {
              term: "No tier-specific code in your app",
              description:
                "You call the SDK with a prompt and a model hint. The router picks the tier. Switching from Claude Sonnet to a local 2B model is a config change, not a rewrite.",
            },
            {
              term: "Automatic failover on retryable errors",
              description:
                "routeAICall() retries against the fallback provider on 429, 500, 502, 503, 504, and the common network error codes. Non-retryable errors (401, 400, 404, 422) propagate immediately so you don't burn money on a misconfigured key.",
            },
            {
              term: "Streamed responses by default",
              description:
                "Both the cloud path and the client path stream tokens as they arrive. Nothing blocks on a full completion. The SSE response from /chat/stream is a plain text stream you can read with a standard fetch + ReadableStream.",
            },
            {
              term: "Typed everywhere",
              description:
                "ComputeTierSchema, CloudInferenceRequestSchema, WebLLMConfigSchema, TransformersConfigSchema — every public input and output is a Zod schema. If it crosses a boundary, it is validated.",
            },
          ]}
        />

        <h2>What's not yet live</h2>

        <Callout tone="note">
          Multi-agent orchestration (LangGraph + Mastra), the full RAG
          pipeline auto-indexing, and generative-UI streaming from the
          component catalogue all have scaffolding in{" "}
          <code>packages/ai-core/src/{"{agents,rag,generative-ui}"}</code>{" "}
          but are still gated behind feature flags. This category will
          grow articles for each as they flip on.
        </Callout>

        <h2>Where to go from here</h2>
        <p>
          Read the three articles in order — they build on each other.
          If you only have time for one, read{" "}
          <a href="/docs/ai-sdk/three-tier-compute">
            Three-tier compute routing
          </a>
          : every other piece of the SDK is downstream of that one
          decision. Once you've read it, the{" "}
          <a href="/docs/api-reference/ai-and-chat">AI & Chat procedures</a>{" "}
          reference in the API Reference category is the procedure-by-
          procedure companion.
        </p>
      </DocsArticle>
    </>
  );
}
