// ── Compute Tier Indicator Component ─────────────────────────────────
// SolidJS component showing which compute tier is active, GPU info,
// model status, latency estimate, and cost indicator.

import { Show, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Badge, Card, Stack, Text } from "@back-to-the-future/ui";
import { computeTier, tierReason, detectAndSetTier } from "../lib/ai-client";
import { detectCapabilities, getModelStatus, getLoadedModelId, getModelInfo } from "../lib/inference";
import type { InferenceCapabilities, ModelStatus } from "../lib/inference";

interface ComputeTierIndicatorProps {
  class?: string;
  compact?: boolean;
}

const TIER_CONFIG = {
  client: { label: "Client GPU", color: "bg-green-500", cost: "$0", latency: "<10ms" },
  edge: { label: "Edge", color: "bg-blue-500", cost: "$", latency: "<50ms" },
  cloud: { label: "Cloud", color: "bg-purple-500", cost: "$$", latency: "<2s" },
} as const satisfies Record<string, { label: string; color: string; cost: string; latency: string }>;

const STATUS_CONFIG: Record<ModelStatus, { label: string; color: string }> = {
  idle: { label: "No model", color: "text-gray-400" },
  loading: { label: "Loading...", color: "text-yellow-400" },
  ready: { label: "Ready", color: "text-green-400" },
  error: { label: "Error", color: "text-red-400" },
  unavailable: { label: "Unavailable", color: "text-gray-500" },
};

export function ComputeTierIndicator(props: ComputeTierIndicatorProps): JSX.Element {
  const [caps, setCaps] = createSignal<InferenceCapabilities | null>(null);

  onMount(async () => {
    const detected = await detectCapabilities();
    setCaps(detected);
    await detectAndSetTier();
  });

  const tierConfig = (): { label: string; color: string; cost: string; latency: string } => {
    const tier = computeTier();
    return TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.cloud;
  };

  const modelStatus = (): ModelStatus => getModelStatus();
  const statusConfig = (): { label: string; color: string } =>
    STATUS_CONFIG[modelStatus()] ?? STATUS_CONFIG.idle;

  const loadedModelName = (): string => {
    const id = getLoadedModelId();
    if (!id) return "None";
    return getModelInfo(id)?.name ?? id;
  };

  if (props.compact) {
    return (
      <div class={`inline-flex items-center gap-2 ${props.class ?? ""}`}>
        <span class={`inline-block w-2 h-2 rounded-full ${tierConfig().color}`} />
        <Text variant="caption">{tierConfig().label}</Text>
        <Text variant="caption" class="text-gray-500">{tierConfig().cost}</Text>
      </div>
    );
  }

  return (
    <Card class={props.class ?? ""} padding="sm">
      <Stack direction="vertical" gap="sm">
        <Stack direction="horizontal" gap="sm" class="items-center justify-between">
          <Stack direction="horizontal" gap="sm" class="items-center">
            <span class={`inline-block w-3 h-3 rounded-full ${tierConfig().color}`} />
            <Text variant="body" weight="semibold">{tierConfig().label}</Text>
          </Stack>
          <Badge variant="default">
            {tierConfig().cost}/token
          </Badge>
        </Stack>

        <Text variant="caption" class="text-gray-400">{tierReason()}</Text>

        <div class="border-t border-gray-700 pt-2 mt-1">
          <Stack direction="vertical" gap="xs">
            <Stack direction="horizontal" gap="sm" class="justify-between">
              <Text variant="caption" class="text-gray-500">Latency</Text>
              <Text variant="caption">{tierConfig().latency}</Text>
            </Stack>

            <Stack direction="horizontal" gap="sm" class="justify-between">
              <Text variant="caption" class="text-gray-500">Model</Text>
              <Text variant="caption" class={statusConfig().color}>
                {loadedModelName()} ({statusConfig().label})
              </Text>
            </Stack>

            <Show when={caps()?.gpuInfo}>
              {(gpuInfo) => (
                <>
                  <Stack direction="horizontal" gap="sm" class="justify-between">
                    <Text variant="caption" class="text-gray-500">GPU</Text>
                    <Text variant="caption">{gpuInfo().vendor ?? "Unknown"}</Text>
                  </Stack>
                  <Stack direction="horizontal" gap="sm" class="justify-between">
                    <Text variant="caption" class="text-gray-500">VRAM (est.)</Text>
                    <Text variant="caption">{gpuInfo().estimatedVRAMMB}MB</Text>
                  </Stack>
                </>
              )}
            </Show>

            <Show when={caps() && !caps()?.hasWebGPU}>
              <Text variant="caption" class="text-yellow-500">
                WebGPU not available. Using server-side inference.
              </Text>
            </Show>

            <Show when={caps()?.supportedModels && caps()!.supportedModels.length > 0}>
              <Text variant="caption" class="text-gray-500">
                {caps()!.supportedModels.length} model(s) supported on this device
              </Text>
            </Show>
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}
