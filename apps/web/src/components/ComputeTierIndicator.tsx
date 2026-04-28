// ── Compute Tier Indicator Component ─────────────────────────────────
// SolidJS component showing which compute tier is active, GPU info,
// model status, latency estimate, and cost indicator.

import { Badge, Card, Stack, Text } from "@back-to-the-future/ui";
import { Show, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { computeTier, detectAndSetTier, tierReason } from "../lib/ai-client";
import {
  detectCapabilities,
  getLoadedModelId,
  getModelInfo,
  getModelStatus,
} from "../lib/inference";
import type { InferenceCapabilities, ModelStatus } from "../lib/inference";

interface ComputeTierIndicatorProps {
  class?: string;
  compact?: boolean;
}

const TIER_CONFIG = {
  client: { label: "Client GPU", cssColor: "var(--color-success)", cost: "$0", latency: "<10ms" },
  edge: { label: "Edge", cssColor: "var(--color-primary)", cost: "$", latency: "<50ms" },
  cloud: { label: "Cloud", cssColor: "var(--color-warning)", cost: "$$", latency: "<2s" },
} as const satisfies Record<
  string,
  { label: string; cssColor: string; cost: string; latency: string }
>;

const STATUS_CONFIG: Record<ModelStatus, { label: string; cssColor: string }> = {
  idle: { label: "No model", cssColor: "var(--color-text-muted)" },
  loading: { label: "Loading...", cssColor: "var(--color-warning)" },
  ready: { label: "Ready", cssColor: "var(--color-success)" },
  error: { label: "Error", cssColor: "var(--color-danger)" },
  unavailable: { label: "Unavailable", cssColor: "var(--color-text-faint)" },
};

export function ComputeTierIndicator(props: ComputeTierIndicatorProps): JSX.Element {
  const [caps, setCaps] = createSignal<InferenceCapabilities | null>(null);

  onMount(async () => {
    const detected = await detectCapabilities();
    setCaps(detected);
    await detectAndSetTier();
  });

  const tierConfig = (): { label: string; cssColor: string; cost: string; latency: string } => {
    const tier = computeTier();
    return TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.cloud;
  };

  const modelStatus = (): ModelStatus => getModelStatus();
  const statusConfig = (): { label: string; cssColor: string } =>
    STATUS_CONFIG[modelStatus()] ?? STATUS_CONFIG.idle;

  const loadedModelName = (): string => {
    const id = getLoadedModelId();
    if (!id) return "None";
    return getModelInfo(id)?.name ?? id;
  };

  if (props.compact) {
    return (
      <div class={`inline-flex items-center gap-2 ${props.class ?? ""}`}>
        <span
          class="inline-block w-2 h-2 rounded-full"
          style={{ background: tierConfig().cssColor }}
        />
        <Text variant="caption">{tierConfig().label}</Text>
        <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
          {tierConfig().cost}
        </Text>
      </div>
    );
  }

  return (
    <Card class={props.class ?? ""} padding="sm">
      <Stack direction="vertical" gap="sm">
        <Stack direction="horizontal" gap="sm" class="items-center justify-between">
          <Stack direction="horizontal" gap="sm" class="items-center">
            <span
              class="inline-block w-3 h-3 rounded-full"
              style={{ background: tierConfig().cssColor }}
            />
            <Text variant="body" weight="semibold">
              {tierConfig().label}
            </Text>
          </Stack>
          <Badge variant="default">{tierConfig().cost}/token</Badge>
        </Stack>

        <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
          {tierReason()}
        </Text>

        <div class="pt-2 mt-1" style={{ "border-top": "1px solid var(--color-border)" }}>
          <Stack direction="vertical" gap="xs">
            <Stack direction="horizontal" gap="sm" class="justify-between">
              <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
                Latency
              </Text>
              <Text variant="caption">{tierConfig().latency}</Text>
            </Stack>

            <Stack direction="horizontal" gap="sm" class="justify-between">
              <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
                Model
              </Text>
              <Text variant="caption" style={{ color: statusConfig().cssColor }}>
                {loadedModelName()} ({statusConfig().label})
              </Text>
            </Stack>

            <Show when={caps()?.gpuInfo}>
              {(gpuInfo) => (
                <>
                  <Stack direction="horizontal" gap="sm" class="justify-between">
                    <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
                      GPU
                    </Text>
                    <Text variant="caption">{gpuInfo().vendor ?? "Unknown"}</Text>
                  </Stack>
                  <Stack direction="horizontal" gap="sm" class="justify-between">
                    <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
                      VRAM (est.)
                    </Text>
                    <Text variant="caption">{gpuInfo().estimatedVRAMMB}MB</Text>
                  </Stack>
                </>
              )}
            </Show>

            <Show when={caps() && !caps()?.hasWebGPU}>
              <Text variant="caption" style={{ color: "var(--color-warning)" }}>
                WebGPU not available. Using server-side inference.
              </Text>
            </Show>

            <Show when={(caps()?.supportedModels?.length ?? 0) > 0}>
              <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
                {caps()?.supportedModels?.length ?? 0} model(s) supported on this device
              </Text>
            </Show>
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}
