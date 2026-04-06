// ── AI Playground Page ───────────────────────────────────────────────
// Test client-side AI inference, embeddings, and compute tier routing.

import { createSignal, For, Show, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { Title } from "@solidjs/meta";
import { Button, Card, Input, Stack, Text, Textarea, Spinner, Select, Badge } from "@back-to-the-future/ui";
import { ComputeTierIndicator } from "../components/ComputeTierIndicator";
import { streamChat, getEmbeddings, computeTier } from "../lib/ai-client";
import {
  loadModel,
  unloadModel,
  isModelLoaded,
  getModelStatus,
  getLoadedModelId,
  getChatModels,
  getEmbeddingModels,
  detectCapabilities,
  type ModelInfo,
  type InferenceCapabilities,
  type ModelStatus,
} from "../lib/inference";

export default function AIPlayground(): JSX.Element {
  // ── State ───────────────────────────────────────────────────────────
  const [prompt, setPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [selectedModel, setSelectedModel] = createSignal("smollm2-360m");
  const [loadProgress, setLoadProgress] = createSignal(0);
  const [loadMessage, setLoadMessage] = createSignal("");
  const [modelLoadStatus, setModelLoadStatus] = createSignal<ModelStatus>("idle");
  const [caps, setCaps] = createSignal<InferenceCapabilities | null>(null);

  // Performance stats
  const [tokensPerSec, setTokensPerSec] = createSignal(0);
  const [latencyMs, setLatencyMs] = createSignal(0);
  const [activeTier, setActiveTier] = createSignal("");

  // Embeddings
  const [embeddingInput, setEmbeddingInput] = createSignal("");
  const [embeddingResult, setEmbeddingResult] = createSignal<number[] | null>(null);
  const [embeddingLatency, setEmbeddingLatency] = createSignal(0);
  const [isEmbedding, setIsEmbedding] = createSignal(false);
  const [embeddingDims, setEmbeddingDims] = createSignal(0);

  // Error
  const [error, setError] = createSignal("");

  // ── Initialization ─────────────────────────────────────────────────
  void detectCapabilities().then((c) => setCaps(c));

  onCleanup(() => {
    // Do not unload on cleanup to preserve model across navigations
  });

  // ── Model Loading ──────────────────────────────────────────────────
  const handleLoadModel = async (): Promise<void> => {
    setError("");
    setModelLoadStatus("loading");
    setLoadProgress(0);
    setLoadMessage("Initializing...");

    try {
      await loadModel(selectedModel(), (progress, message) => {
        setLoadProgress(Math.round(progress * 100));
        setLoadMessage(message);
      });
      setModelLoadStatus("ready");
      setLoadMessage("Model loaded successfully");
    } catch (err) {
      setModelLoadStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load model");
    }
  };

  const handleUnloadModel = async (): Promise<void> => {
    await unloadModel();
    setModelLoadStatus("idle");
    setLoadProgress(0);
    setLoadMessage("");
  };

  // ── Text Generation ────────────────────────────────────────────────
  const handleGenerate = async (): Promise<void> => {
    if (!prompt().trim() || isGenerating()) return;

    setError("");
    setResponse("");
    setIsGenerating(true);
    setTokensPerSec(0);
    setLatencyMs(0);
    setActiveTier("");

    await streamChat(
      [{ role: "user", content: prompt() }],
      (token) => setResponse((prev) => prev + token),
      (result) => {
        setIsGenerating(false);
        setTokensPerSec(result.tokensPerSecond);
        setLatencyMs(result.latencyMs);
        setActiveTier(result.tier);
      },
      (errMsg) => {
        setIsGenerating(false);
        setError(errMsg);
      },
    );
  };

  // ── Embeddings ─────────────────────────────────────────────────────
  const handleEmbeddings = async (): Promise<void> => {
    if (!embeddingInput().trim() || isEmbedding()) return;

    setError("");
    setEmbeddingResult(null);
    setIsEmbedding(true);

    try {
      const result = await getEmbeddings(embeddingInput());
      setEmbeddingResult(result.vector);
      setEmbeddingLatency(result.latencyMs);
      setEmbeddingDims(result.dimensions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Embedding failed");
    } finally {
      setIsEmbedding(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div class="max-w-6xl mx-auto p-6 space-y-6">
      <Title>AI Playground | Marco Reid</Title>

      <Stack direction="vertical" gap="md">
        <Text variant="heading" class="text-2xl font-bold">AI Playground</Text>
        <Text variant="body" class="text-gray-400">
          Test client-side AI inference via WebGPU. Models run directly in your browser at $0/token.
        </Text>
      </Stack>

      <Show when={error()}>
        <Card padding="sm" class="border-red-500 bg-red-950">
          <Text variant="body" class="text-red-300">{error()}</Text>
        </Card>
      </Show>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Controls */}
        <div class="space-y-4">
          <ComputeTierIndicator />

          {/* Model Selection */}
          <Card padding="sm">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" weight="semibold">Model Selection</Text>

              <Select
                value={selectedModel()}
                onChange={(value) => setSelectedModel(value)}
                options={getChatModels().map((m: ModelInfo) => ({
                  value: m.id,
                  label: `${m.name} (${m.parametersBillion}B)`,
                }))}
              />

              <Show when={caps()}>
                {(capsVal) => {
                  const supported = (): boolean =>
                    capsVal().supportedModels.some((m: ModelInfo) => m.id === selectedModel());
                  return (
                    <Show
                      when={supported()}
                      fallback={
                        <Text variant="caption" class="text-yellow-500">
                          This model may not run on your device (insufficient VRAM).
                        </Text>
                      }
                    >
                      <Text variant="caption" class="text-green-500">
                        Compatible with your device
                      </Text>
                    </Show>
                  );
                }}
              </Show>

              <Stack direction="horizontal" gap="sm">
                <Button
                  variant="primary"
                  onClick={() => void handleLoadModel()}
                  disabled={modelLoadStatus() === "loading" || modelLoadStatus() === "ready"}
                  loading={modelLoadStatus() === "loading"}
                >
                  {modelLoadStatus() === "loading" ? "Loading..." : "Load Model"}
                </Button>
                <Show when={isModelLoaded()}>
                  <Button variant="default" onClick={() => void handleUnloadModel()}>
                    Unload
                  </Button>
                </Show>
              </Stack>

              <Show when={modelLoadStatus() === "loading"}>
                <div class="space-y-1">
                  <div class="w-full bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${loadProgress()}%` }}
                    />
                  </div>
                  <Text variant="caption" class="text-gray-400">{loadMessage()}</Text>
                </div>
              </Show>

              <Show when={modelLoadStatus() === "ready"}>
                <Badge variant="default">
                  {getLoadedModelId()} loaded
                </Badge>
              </Show>
            </Stack>
          </Card>

          {/* Performance Stats */}
          <Card padding="sm">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" weight="semibold">Performance</Text>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <Text variant="caption" class="text-gray-500">Tokens/sec</Text>
                  <Text variant="body" weight="semibold">{tokensPerSec() || "--"}</Text>
                </div>
                <div>
                  <Text variant="caption" class="text-gray-500">Latency</Text>
                  <Text variant="body" weight="semibold">
                    {latencyMs() ? `${latencyMs()}ms` : "--"}
                  </Text>
                </div>
                <div>
                  <Text variant="caption" class="text-gray-500">Tier Used</Text>
                  <Text variant="body" weight="semibold">{activeTier() || "--"}</Text>
                </div>
                <div>
                  <Text variant="caption" class="text-gray-500">Cost</Text>
                  <Text variant="body" weight="semibold" class="text-green-400">
                    {computeTier() === "client" ? "$0" : computeTier() === "edge" ? "$" : "$$"}
                  </Text>
                </div>
              </div>
            </Stack>
          </Card>
        </div>

        {/* Center column: Chat */}
        <div class="lg:col-span-2 space-y-4">
          {/* Text Generation */}
          <Card padding="sm">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" weight="semibold">Text Generation</Text>
              <Textarea
                placeholder="Enter a prompt... (e.g., 'Explain WebGPU in one paragraph')"
                value={prompt()}
                onInput={(e) => setPrompt(e.currentTarget.value)}
                class="min-h-[100px]"
              />
              <Stack direction="horizontal" gap="sm">
                <Button
                  variant="primary"
                  onClick={() => void handleGenerate()}
                  disabled={!prompt().trim() || isGenerating()}
                  loading={isGenerating()}
                >
                  {isGenerating() ? "Generating..." : "Generate"}
                </Button>
                <Show when={response()}>
                  <Button variant="default" onClick={() => setResponse("")}>
                    Clear
                  </Button>
                </Show>
              </Stack>
            </Stack>
          </Card>

          {/* Response Display */}
          <Card padding="sm" class="min-h-[200px]">
            <Stack direction="vertical" gap="sm">
              <Stack direction="horizontal" gap="sm" class="items-center justify-between">
                <Text variant="body" weight="semibold">Response</Text>
                <Show when={isGenerating()}>
                  <Spinner size="sm" />
                </Show>
              </Stack>
              <Show when={response()} fallback={
                <Text variant="body" class="text-gray-500 italic">
                  Response will appear here...
                </Text>
              }>
                <div class="bg-gray-800 rounded p-3 whitespace-pre-wrap font-mono text-sm">
                  <Text variant="body">{response()}</Text>
                </div>
              </Show>
            </Stack>
          </Card>

          {/* Embeddings Test */}
          <Card padding="sm">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" weight="semibold">Embeddings Test</Text>
              <Text variant="caption" class="text-gray-400">
                Generate vector embeddings locally via Transformers.js
              </Text>
              <Input
                placeholder="Enter text to embed..."
                value={embeddingInput()}
                onInput={(e) => setEmbeddingInput(e.currentTarget.value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    void handleEmbeddings();
                  }
                }}
              />
              <Button
                variant="primary"
                onClick={() => void handleEmbeddings()}
                disabled={!embeddingInput().trim() || isEmbedding()}
                loading={isEmbedding()}
              >
                {isEmbedding() ? "Computing..." : "Get Embeddings"}
              </Button>

              <Show when={embeddingResult()}>
                {(vec) => (
                  <div class="space-y-2">
                    <Stack direction="horizontal" gap="md">
                      <Badge variant="default">{embeddingDims()} dimensions</Badge>
                      <Badge variant="default">{embeddingLatency()}ms</Badge>
                    </Stack>
                    <div class="bg-gray-800 rounded p-3 max-h-[150px] overflow-y-auto font-mono text-xs">
                      <Text variant="caption">
                        [{vec().slice(0, 20).map((v) => v.toFixed(4)).join(", ")}
                        {vec().length > 20 ? `, ... (${vec().length - 20} more)` : ""}]
                      </Text>
                    </div>
                  </div>
                )}
              </Show>
            </Stack>
          </Card>
        </div>
      </div>
    </div>
  );
}
