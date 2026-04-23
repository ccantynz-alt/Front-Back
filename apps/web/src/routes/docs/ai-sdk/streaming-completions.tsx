// ── /docs/ai-sdk/streaming-completions — SSE streaming reference ────
//
// Documents the POST /chat/stream Hono route from
// apps/api/src/ai/chat-stream.ts, end-to-end: auth, user-key-vs-env-key
// resolution, schema validation, streamText() from the Vercel AI SDK,
// and GET /chat/status for UI gating. Every mentioned field matches
// the ChatStreamInput schema in the source.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function StreamingCompletionsArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Streaming completions"
        description="How Crontech streams AI responses over SSE. The /chat/stream Hono route, user-key-vs-env-key resolution, streamText() from the Vercel AI SDK, and how the dashboard consumes the token stream."
        path="/docs/ai-sdk/streaming-completions"
      />

      <DocsArticle
        eyebrow="AI SDK"
        title="Streaming completions"
        subtitle="Every conversational AI response on Crontech is streamed. The server opens an SSE response, the provider's token-by-token output is forwarded verbatim, and the client reads a plain text stream. Here is how the wiring actually works."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "Client-GPU inference",
          href: "/docs/ai-sdk/client-gpu-inference",
          description:
            "The $0/token streaming path: WebLLM and Transformers.js running inference in the user's browser with WebGPU.",
        }}
      >
        <p>
          The server-side streaming entry point is a single Hono route
          at{" "}
          <code>POST /chat/stream</code>, defined in{" "}
          <code>apps/api/src/ai/chat-stream.ts</code> and mounted on
          the API app under <code>/chat</code>. It takes a message
          array, resolves an Anthropic API key, hands the call to{" "}
          <code>streamText()</code> from the Vercel AI SDK, and returns
          a plain text stream over HTTP.
        </p>

        <Callout tone="info" title="Why one route, not a tRPC subscription">
          SSE streams are long-lived HTTP responses, and the Vercel AI
          SDK's <code>streamText()</code> already produces a{" "}
          <code>ReadableStream</code> that parks nicely on top of
          Hono's response handler. Wrapping it in a tRPC subscription
          adds a framing layer the consumer doesn't need. The route
          stays as a raw Hono handler so the wire format is
          interoperable with any SSE reader.
        </Callout>

        <h2>Route lifecycle</h2>

        <KeyList
          items={[
            {
              term: "1. Authentication",
              description:
                "The route reads a Bearer token from the Authorization header and calls validateSession() against the DB. No session → 401. No Authorization header → 401. No guessing, no anonymous mode.",
            },
            {
              term: "2. Input validation",
              description:
                "The body is parsed against ChatStreamInput — a Zod schema with messages (≥ 1), model (default claude-sonnet-4-20250514), maxTokens (1..64000, default 4096), temperature (0..1, default 0.7), and an optional systemPrompt up to 10 000 chars. Schema failure → 400 with a flattened error.",
            },
            {
              term: "3. API key resolution",
              description:
                "The user's stored Anthropic key is looked up from userProviderKeys (scoped to the authenticated userId, provider = anthropic, isActive = true) and decrypted with AES-256-GCM using SESSION_SECRET as the master key. If no user key is stored, the route falls back to process.env.ANTHROPIC_API_KEY. No key anywhere → 400 with a Settings-link hint.",
            },
            {
              term: "4. Model construction",
              description:
                "The resolved key is passed to getAnthropicModel(apiKey, model) — a tiny helper in packages/ai-core/src/providers.ts that wraps the @ai-sdk/anthropic createAnthropic factory. The returned LanguageModel is the object streamText() expects.",
            },
            {
              term: "5. Streamed response",
              description:
                "streamText({ model, messages, maxOutputTokens, temperature }) returns an object whose toTextStreamResponse() method yields a ReadableStream with the right SSE headers. The route sets Cache-Control: no-cache, Connection: keep-alive, and X-Model-Id (the model the caller asked for) alongside the stream.",
            },
            {
              term: "6. Secret scrubbing",
              description:
                "The decrypted key lives inside a SecureString wrapper. When the handler finishes — success or failure — the buffer is zeroed so the plaintext key does not linger on the heap.",
            },
          ]}
        />

        <h2>The request shape</h2>

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
          <code>{`// From apps/api/src/ai/chat-stream.ts
const ChatStreamInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  model: z.string().default("claude-sonnet-4-20250514"),
  maxTokens: z.number().int().min(1).max(64000).default(4096),
  temperature: z.number().min(0).max(1).default(0.7),
  systemPrompt: z.string().max(10_000).optional(),
});`}</code>
        </pre>

        <p>
          <code>systemPrompt</code> is a convenience for callers that
          don't want to assemble a <code>role: "system"</code> message
          themselves. When present, the handler prepends it to the
          messages array before passing them to{" "}
          <code>streamText()</code>.
        </p>

        <h2>Calling the route</h2>

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
          <code>{`const response = await fetch("/chat/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${sessionToken}\`,
  },
  body: JSON.stringify({
    messages: [
      { role: "user", content: "Give me three launch-week slogans." },
    ],
    model: "claude-sonnet-4-6",
    maxTokens: 512,
    temperature: 0.8,
  }),
});

if (!response.ok) {
  const err = await response.json();
  throw new Error(err.error);
}

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let full = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  full += chunk;
  // render the chunk as it arrives
}`}</code>
        </pre>

        <Callout tone="note">
          The response body is a plain text stream — not an
          <code> application/json</code> document. Do not await{" "}
          <code>response.json()</code>; you will block until the full
          completion arrives and lose the whole point of streaming.
          Read the body with a <code>ReadableStreamDefaultReader</code>{" "}
          and decode chunks as they come.
        </Callout>

        <h2>Error shapes</h2>

        <KeyList
          items={[
            {
              term: "401 — Authentication required",
              description:
                "No Authorization header, or the token failed validateSession(). The dashboard redirects to /login when it sees this.",
            },
            {
              term: "400 — Invalid input",
              description:
                "The body failed ChatStreamInput.safeParse(). The response includes a `details` field with the flattened Zod error so the caller can point at the bad field.",
            },
            {
              term: "400 — No Anthropic API key configured",
              description:
                "Neither the authenticated user nor the server has a key. The response ships a `hint` pointing at Settings → AI Provider Keys.",
            },
            {
              term: "500 — Chat stream failed",
              description:
                "A runtime error from streamText() or the upstream provider. The response carries the error message and a hint to check the key or the provider's credit balance. Callers that want auto-retry should wrap the fetch in the provider-factory routeAICall() pattern on the server and re-stream the result — the client does not retry directly.",
            },
          ]}
        />

        <h2>Status endpoint</h2>

        <p>
          Before the UI opens a stream it usually wants to know whether
          a key is configured. <code>GET /chat/status</code> answers
          that without touching any credentials:
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
          <code>{`GET /chat/status
Authorization: Bearer <session>

{
  "configured": true,
  "source": "user" | "server" | "none",
  "models": [
    { "id": "claude-opus-4-7",      "name": "Claude Opus 4.7",   ... },
    { "id": "claude-sonnet-4-6",    "name": "Claude Sonnet 4.6", ... },
    { "id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5", ... }
  ]
}`}</code>
        </pre>

        <p>
          The <code>models</code> list is assembled from{" "}
          <code>ANTHROPIC_MODELS</code> in{" "}
          <code>packages/ai-core/src/providers.ts</code>, which also
          carries per-million-token input/output costs — the dashboard
          uses the same entries to render the model picker and the
          cost estimator.
        </p>

        <h2>How the router hands work to this route</h2>

        <p>
          The{" "}
          <a href="/docs/ai-sdk/three-tier-compute">
            three-tier router
          </a>{" "}
          runs <em>before</em> this endpoint is called. When the
          router's decision is <code>"cloud"</code> (or{" "}
          <code>"edge"</code> with an Anthropic fallback), the caller
          POSTs to <code>/chat/stream</code> and this route takes it
          from there. When the decision is{" "}
          <code>"client"</code>, the stream stays in the browser — see{" "}
          <a href="/docs/ai-sdk/client-gpu-inference">
            Client-GPU inference
          </a>{" "}
          for that path.
        </p>

        <h2>Observability</h2>

        <p>
          Every response sets the <code>X-Model-Id</code> header, so a
          dashboard trace can bucket streams by model without parsing
          the body. Token usage + cost are recorded on conversation
          persistence via the{" "}
          <a href="/docs/api-reference/ai-and-chat">
            <code>chat.saveMessage</code>
          </a>{" "}
          mutation — the streaming route itself does not write to the
          DB, it just serves the bytes.
        </p>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "Three-tier compute routing",
              description:
                "Decides whether the request comes to this endpoint at all.",
            },
            {
              term: "Client-GPU inference",
              description:
                "The alternate streaming path — same wire shape, different compute tier.",
            },
            {
              term: "AI & Chat procedures",
              description:
                "Conversation lifecycle, per-message persistence, and usage metering that wraps around this stream.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
