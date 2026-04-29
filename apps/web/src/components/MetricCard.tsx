import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Box, Stack, Text } from "@back-to-the-future/ui";

// ── Types ────────────────────────────────────────────────────────────

export interface MetricCardProps {
  name: string;
  value: string;
  unit?: string;
  change: number;
  /** "healthy" | "warning" | "critical" */
  status: "healthy" | "warning" | "critical";
  /** Recent data points for the sparkline mini-chart */
  sparkline: number[];
  /** Accent color override — defaults to status color */
  color?: string;
  icon?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<MetricCardProps["status"], string> = {
  healthy: "var(--color-success)",
  warning: "var(--color-warning)",
  critical: "var(--color-danger)",
};

function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2),
  }));

  // Build smooth bezier path
  const first = points[0]!;
  let d = `M${first.x},${first.y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

// ── Component ────────────────────────────────────────────────────────

export function MetricCard(props: MetricCardProps): JSX.Element {
  const accentColor = createMemo((): string => props.color ?? STATUS_COLORS[props.status]);

  const trendUp = createMemo((): boolean => props.change >= 0);

  const changeText = createMemo((): string => {
    const abs = Math.abs(props.change);
    return `${trendUp() ? "+" : "-"}${abs.toFixed(1)}%`;
  });

  const changeColor = createMemo((): string => {
    // For metrics like CPU/Memory, up is warning; for requests/bandwidth, up is good
    // We rely on the parent-provided status rather than guessing
    return STATUS_COLORS[props.status];
  });

  const sparkWidth = 120;
  const sparkHeight = 32;

  const lineD = createMemo((): string => sparklinePath(props.sparkline, sparkWidth, sparkHeight));

  const areaD = createMemo((): string => {
    const line = lineD();
    if (!line) return "";
    const lastX = sparkWidth;
    return `${line} L${lastX},${sparkHeight} L0,${sparkHeight} Z`;
  });

  const sparkGradientId = createMemo(
    (): string => `spark-grad-${props.name.replace(/\s+/g, "-").toLowerCase()}`,
  );

  return (
    <Box
      class="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] p-5 transition-all duration-300 hover:border-[var(--color-border-hover)]"
      style={{
        background: "var(--color-bg-elevated)",
      }}
    >

      <Box class="relative z-10">
        {/* Header row: label + sparkline */}
        <Stack direction="horizontal" align="start" justify="between">
          <Stack direction="vertical" gap="xs">
            <Stack direction="horizontal" gap="xs" align="center">
              <Text
                as="span"
                class="inline-flex h-6 w-6 items-center justify-center rounded-md text-xs"
                style={{
                  background: `${accentColor()}18`,
                  color: accentColor(),
                }}
              >
                {props.icon ?? "\u{1F4CA}"}
              </Text>
              <Text as="span" weight="medium" class="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
                {props.name}
              </Text>
            </Stack>

            {/* Value row */}
            <Stack direction="horizontal" gap="xs" align="end" class="mt-2">
              <Text as="span" weight="bold" class="text-3xl tracking-tight" style={{ color: "var(--color-text)" }}>
                {props.value}
              </Text>
              <Text as="span" class="text-sm text-[var(--color-text-muted)]">{props.unit ?? ""}</Text>
            </Stack>

            {/* Trend row */}
            <Stack direction="horizontal" gap="xs" align="center" class="mt-1">
              {/* Trend arrow */}
              <Text
                as="span"
                weight="semibold"
                class="text-xs"
                style={{ color: changeColor() }}
              >
                {trendUp() ? "\u2191" : "\u2193"} {changeText()}
              </Text>
              <Text as="span" class="text-[10px] text-[var(--color-text-faint)]">vs prev period</Text>
            </Stack>
          </Stack>

          {/* Sparkline */}
          <Box class="mt-1 shrink-0">
            <svg
              width={sparkWidth}
              height={sparkHeight}
              viewBox={`0 0 ${sparkWidth} ${sparkHeight}`}
              class="overflow-visible"
            >
              <defs>
                <linearGradient id={sparkGradientId()} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color={accentColor()} stop-opacity="0.2" />
                  <stop offset="100%" stop-color={accentColor()} stop-opacity="0" />
                </linearGradient>
              </defs>
              {/* Area fill */}
              <path
                d={areaD()}
                fill={`url(#${sparkGradientId()})`}
              />
              {/* Line */}
              <path
                d={lineD()}
                fill="none"
                stroke={accentColor()}
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </Box>
        </Stack>

        {/* Status indicator dot */}
        <Stack direction="horizontal" gap="xs" align="center" class="mt-3">
          <Box
            class="h-1.5 w-1.5 rounded-full"
            style={{ background: accentColor() }}
          />
          <Text as="span" weight="medium" class="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {props.status}
          </Text>
        </Stack>
      </Box>
    </Box>
  );
}
