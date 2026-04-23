// ── /docs/ai-sdk/client-gpu-inference — WebGPU + WebLLM + Transformers
//
// Describes the client-side tier: WebGPU detection, WebLLM for chat,
// Transformers.js for ML pipelines, and the unified clientInfer()
// entry point. Cites the real exports from
// packages/ai-core/src/inference/{index,webllm,transformers}.ts and
// touches apps/web/src/gpu/* for the WebGPU video processor that
// shares the same GPU stack.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function ClientGpuInferenceArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Client-GPU inference"
        description="Running AI inference in the browser with WebGPU. WebLLM for chat, Transformers.js for embeddings and classification, and the unified clientInfer() entry point. $0 per token."
        path="/docs/ai-sdk/client-gpu-inference"
      />

      <DocsArticle
        eyebrow="AI SDK"
        title="Client-GPU inference"
        subtitle="When the three-tier router picks client, the model runs in the user's browser on their GPU. Zero tokens are billed, zero bytes leave the device, and the first token lands in under ten milliseconds. Here is exactly how that tier works."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "AI & Chat procedures",
          href: "/docs/api-reference/ai-and-chat",
          description:
            "Ready to wire this into a real app? The AI & Chat reference lists the tRPC surface that persists conversations, meters usage, and exposes the site builder.",
        }}
      >
        <p>
          The client tier is the cheapest part of the Crontech AI
          stack. When the{" "}
          <a href="/docs/ai-sdk/three-tier-compute">
            three-tier router
          </a>{" "}
          returns <code>"client"</code>, the request never leaves the
          browser — a WebGPU-backed engine runs the model locally,
          streams the output into the page, and the server only sees
          whatever the user chooses to persist afterwards.
        </p>

        <Callout tone="info" title="The cost floor">
          Every client-tier token costs <strong>$0</strong>. There is
          no per-request server billing, no provider invoice, no
          token meter. The user's hardware does the work. The platform
          earns its keep by routing <em>when</em> the client tier is
          actually capable of the call — for everything else, the
          router picks edge or cloud.
        </Callout>

        <h2>Two engines, one entry point</h2>

        <p>
          Client inference is split across two engines, unified behind{" "}
          <code>clientInfer()</code> in{" "}
          <code>packages/ai-core/src/inference/index.ts</code>:
        </p>

        <KeyList
          items={[
            {
              term: "WebLLM — chat and generation",
              description:
                "packages/ai-core/src/inference/webllm.ts. Runs quantised LLMs (Llama 3.1 8B, Phi-3.5 Mini, Gemma 2 2B) on WebGPU at 30–40 tokens/second on mid-range GPUs. Requires WebGPU.",
            },
            {
              term: "Transformers.js — ML pipelines",
              description:
                "packages/ai-core/src/inference/transformers.ts. Runs embeddings, classification, summarization, and feature extraction via ONNX models. Works with plain WASM on devices without a GPU, and accelerates to WebGPU when one is present.",
            },
          ]}
        />

        <h2>Probing the device</h2>

        <p>
          Before any model loads,{" "}
          <code>getClientCapabilities()</code> runs a synchronous
          probe. It never touches the GPU and never awaits — it's safe
          to call in a tight render loop. The result tells the router
          what the device can handle:
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
          <code>{`// packages/ai-core/src/inference/index.ts
export interface ClientCapabilities {
  available: boolean;
  hasWebGPU: boolean;
  hasWASM: boolean;
  supportedTasks: InferenceTask[];
  maxModelSizeBillion: number;
  estimatedVRAMMB: number;
}

const caps = getClientCapabilities();
// { hasWebGPU: true, hasWASM: true,
//   supportedTasks: ["embeddings", "classification", "summarization",
//                    "feature-extraction", "chat"],
//   estimatedVRAMMB: 8192, maxModelSizeBillion: 6 }`}</code>
        </pre>

        <p>
          <code>estimatedVRAMMB</code> is a rough proxy built from{" "}
          <code>navigator.deviceMemory</code> — dedicated VRAM is not
          exposed to the web, so the probe reads system memory as a
          conservative lower bound. <code>maxModelSizeBillion</code> is
          derived from that (~1.2 GB per billion params at q4
          quantisation).
        </p>

        <h2>WebLLM — chat in the browser</h2>

        <p>
          <code>initializeWebLLM()</code> downloads the selected model,
          warms the WebGPU shaders, and parks a singleton engine in
          module scope. Subsequent calls reuse the same engine until{" "}
          <code>unloadWebLLM()</code> frees it. The available models
          live in <code>WEBLLM_MODELS</code>:
        </p>

        <KeyList
          items={[
            {
              term: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
              description:
                "Meta Llama 3.1 8B, 4-bit quantised. ~6 GB VRAM. ~41 tokens/second on an M-series or mid-range discrete GPU. Strong general-purpose chat.",
            },
            {
              term: "Phi-3.5-mini-instruct-q4f16_1-MLC",
              description:
                "Microsoft Phi-3.5 Mini, 3.8B params. ~3 GB VRAM. Excellent reasoning per byte — the default on integrated GPUs.",
            },
            {
              term: "gemma-2-2b-it-q4f32_1-MLC",
              description:
                "Google Gemma 2 2B. ~2 GB VRAM. The smallest slot; runs on almost any WebGPU-capable device.",
            },
          ]}
        />

        <p>
          Pick a model explicitly, or let{" "}
          <code>selectModelForVRAM(vramMB)</code> pick the largest one
          that fits. The engine exposes two call shapes:
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
          <code>{`import {
  initializeWebLLM,
  chatCompletion,
  chatCompletionStream,
  selectModelForVRAM,
  getClientCapabilities,
} from "@back-to-the-future/ai-core";

const caps = getClientCapabilities();
const best = selectModelForVRAM(caps.estimatedVRAMMB);
if (!best) throw new Error("No WebLLM model fits this device.");

await initializeWebLLM({ modelId: best.id, temperature: 0.7 });

// Non-streaming:
const { content, usage } = await chatCompletion([
  { role: "user", content: "Give me three slogans." },
]);

// Streaming:
for await (const chunk of chatCompletionStream([
  { role: "user", content: "Give me three slogans." },
])) {
  if (!chunk.done) process.stdout.write(chunk.delta);
}`}</code>
        </pre>

        <Callout tone="note">
          The first call to{" "}
          <code>initializeWebLLM()</code> downloads the model weights
          (hundreds of MB). Subsequent sessions hit the browser cache
          and initialise in a second or two. Surface a progress
          indicator on first load —{" "}
          <code>ModelLoadProgressCallback</code> fires progress events
          during the download so you don't need to poll.
        </Callout>

        <h2>Transformers.js — pipelines without a GPU</h2>

        <p>
          Lightweight ML tasks run via Transformers.js, which uses
          ONNX Runtime Web under the hood. These do not need WebGPU —
          plain WebAssembly is enough, which means embeddings,
          classification, and summarization work on every modern
          browser on the market, not just the ones with GPU access.
        </p>

        <KeyList
          items={[
            {
              term: "generateEmbeddings(texts)",
              description:
                "Dense sentence embeddings. The default model is a small MiniLM variant — swap via TransformersConfig.modelId if you want something bigger.",
            },
            {
              term: "classifyText(text)",
              description:
                "Zero-shot or fine-tuned classification. Returns ClassificationResult with label + confidence.",
            },
            {
              term: "summarizeText(text, cfg?, maxLength?, minLength?)",
              description:
                "Extractive/abstractive summarisation. Hard-caps summary length via the maxLength / minLength helpers so long documents don't time out the tab.",
            },
            {
              term: "extractFeatures(texts)",
              description:
                "Raw hidden-state features. Useful when you want to feed the vectors into a downstream classifier or retrieval index.",
            },
          ]}
        />

        <h2>The unified entry point</h2>

        <p>
          Most callers don't touch WebLLM or Transformers.js directly
          — they call <code>clientInfer()</code>, which dispatches on
          the task:
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
          <code>{`import { clientInfer } from "@back-to-the-future/ai-core";

// Embeddings — works with WASM, no GPU required.
const embed = await clientInfer({
  task: "embeddings",
  texts: ["The quick brown fox", "jumps over the lazy dog"],
});

// Chat — requires WebGPU + enough VRAM for the selected model.
const reply = await clientInfer({
  task: "chat",
  messages: [{ role: "user", content: "Hi." }],
  stream: false,
});

// Streaming chat — same as above with stream: true, result is an
// AsyncGenerator<ChatCompletionChunk>.
const streamed = await clientInfer({
  task: "chat",
  messages: [{ role: "user", content: "Stream me a haiku." }],
  stream: true,
});
if (streamed.task === "chat-stream") {
  for await (const chunk of streamed.result) {
    if (!chunk.done) render(chunk.delta);
  }
}`}</code>
        </pre>

        <p>
          <code>clientInfer()</code> auto-initialises the engine the
          first time it sees a chat task, picks the largest WebLLM
          model that fits VRAM, and keeps the engine warm for the rest
          of the session. Tasks the device cannot support throw with a
          clear message listing the tasks it <em>can</em> support — no
          silent fallback.
        </p>

        <h2>Memory discipline</h2>

        <p>
          Large models live in GPU memory for the lifetime of the tab.
          A single engine is kept alive at a time; switching models
          unloads the previous one. <code>disposePipeline()</code> and{" "}
          <code>disposeAllPipelines()</code> release Transformers.js
          pipelines explicitly — useful before navigating away from a
          heavy page, or when you know the user is done with client
          inference for the session.
        </p>

        <Callout tone="warn">
          Browsers cap total VRAM per tab. If you load a 6 GB Llama
          model and then try to load a second model, the second load
          will either fail or evict the first. Either unload
          explicitly or let <code>clientInfer()</code>'s singleton
          pattern handle it — do not try to hold multiple WebLLM
          engines alive simultaneously.
        </Callout>

        <h2>WebGPU beyond inference</h2>

        <p>
          The same WebGPU surface powers more than inference. The
          WebGPU video processor at{" "}
          <code>apps/web/src/gpu/video/processor.ts</code> runs
          frame-level effects and transforms on the GPU with a
          Canvas2D fallback — the{" "}
          <code>VideoProcessor</code> class detects the same{" "}
          <code>navigator.gpu</code> capability and picks{" "}
          <code>"webgpu"</code> vs <code>"canvas2d"</code> at
          construction time. Client-side inference and client-side
          video share one GPU stack, not two.
        </p>

        <h2>When the client tier cannot take it</h2>

        <p>
          If <code>getClientCapabilities()</code> reports no supported
          task, or the selected task isn't in{" "}
          <code>supportedTasks</code>, callers should fall back to the
          streaming server path at{" "}
          <a href="/docs/ai-sdk/streaming-completions">
            <code>POST /chat/stream</code>
          </a>
          . The router already does this automatically — the only time
          you see a "not supported" error is if you bypass the router
          and call <code>clientInfer()</code> directly on a device
          that can't satisfy the task.
        </p>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "Three-tier compute routing",
              description:
                "The decision function that decides whether a request runs here vs on the edge or in the cloud.",
            },
            {
              term: "Streaming completions",
              description:
                "The server-side fallback when the client tier can't take the request.",
            },
            {
              term: "AI & Chat procedures",
              description:
                "Persist what the client generated — conversations, messages, usage stats.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
