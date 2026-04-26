import { createSignal, createMemo, createEffect, onCleanup, For, Show } from "solid-js";
import type { JSX, Accessor } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

export interface DataPoint {
  timestamp: number;
  value: number;
}

export interface MetricsChartProps {
  data: DataPoint[];
  color: string;
  label: string;
  unit?: string;
  /** Height of the chart in pixels */
  height?: number;
  /** Whether to animate the line drawing on mount */
  animate?: boolean;
  /** Format function for Y-axis values */
  formatValue?: (value: number) => string;
  /** Format function for X-axis timestamps */
  formatTime?: (timestamp: number) => string;
}

// ── Helpers ──────────────────────────────────────────────────────────

const PADDING = { top: 20, right: 16, bottom: 40, left: 56 };

function defaultFormatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(1);
}

function defaultFormatTime(ts: number): string {
  const d = new Date(ts);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Compute smooth bezier control points for a cubic spline */
function computeBezierPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`;

  const first = points[0]!;
  let d = `M${first.x},${first.y}`;

  if (points.length === 2) {
    const second = points[1]!;
    d += ` L${second.x},${second.y}`;
    return d;
  }

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

export function MetricsChart(props: MetricsChartProps): JSX.Element {
  const [containerWidth, setContainerWidth] = createSignal(600);
  const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null);
  const [animProgress, setAnimProgress] = createSignal(props.animate !== false ? 0 : 1);
  let containerRef: HTMLDivElement | undefined;

  const chartHeight = (): number => props.height ?? 240;
  const formatVal: Accessor<(v: number) => string> = (): ((v: number) => string) =>
    props.formatValue ?? defaultFormatValue;
  const formatTm: Accessor<(t: number) => string> = (): ((t: number) => string) =>
    props.formatTime ?? defaultFormatTime;

  // Observe container width for responsiveness
  createEffect((): void => {
    if (!containerRef) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  // Animate entrance — skip entirely when user prefers reduced motion
  createEffect((): void => {
    if (props.animate === false) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setAnimProgress(1);
      return;
    }
    let frame: number;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number): void => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - (1 - t) ** 3;
      setAnimProgress(eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(frame));
  });

  // Computed chart dimensions
  const plotWidth = (): number => containerWidth() - PADDING.left - PADDING.right;
  const plotHeight = (): number => chartHeight() - PADDING.top - PADDING.bottom;

  // Y-axis domain
  const yDomain = createMemo((): { min: number; max: number } => {
    const vals = props.data.map((d) => d.value);
    if (vals.length === 0) return { min: 0, max: 100 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const padding = (max - min) * 0.1 || 10;
    return { min: Math.max(0, min - padding), max: max + padding };
  });

  // Points mapped to SVG coordinates
  const mappedPoints = createMemo((): Array<{ x: number; y: number; data: DataPoint }> => {
    const data = props.data;
    if (data.length === 0) return [];
    const pw = plotWidth();
    const ph = plotHeight();
    const { min, max } = yDomain();
    const range = max - min || 1;

    return data.map((d, i) => ({
      x: PADDING.left + (data.length > 1 ? (i / (data.length - 1)) * pw : pw / 2),
      y: PADDING.top + ph - ((d.value - min) / range) * ph,
      data: d,
    }));
  });

  // SVG path for the line
  const linePath = createMemo((): string => computeBezierPath(mappedPoints()));

  // SVG path for the gradient fill (closed path)
  const areaPath = createMemo((): string => {
    const pts = mappedPoints();
    if (pts.length === 0) return "";
    const base = linePath();
    const lastPt = pts[pts.length - 1]!;
    const firstPt = pts[0]!;
    const bottom = PADDING.top + plotHeight();
    return `${base} L${lastPt.x},${bottom} L${firstPt.x},${bottom} Z`;
  });

  // Y-axis tick values
  const yTicks = createMemo((): number[] => {
    const { min, max } = yDomain();
    const count = 5;
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + step * i);
  });

  // X-axis time labels (pick ~6 evenly spaced)
  const xTicks = createMemo((): Array<{ x: number; label: string }> => {
    const pts = mappedPoints();
    if (pts.length < 2) return [];
    const count = Math.min(6, pts.length);
    const step = Math.max(1, Math.floor((pts.length - 1) / (count - 1)));
    const ticks: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < pts.length; i += step) {
      const pt = pts[i]!;
      ticks.push({ x: pt.x, label: formatTm()(pt.data.timestamp) });
    }
    // Always include last point
    const last = pts[pts.length - 1]!;
    if (ticks.length === 0 || ticks[ticks.length - 1]!.x !== last.x) {
      ticks.push({ x: last.x, label: formatTm()(last.data.timestamp) });
    }
    return ticks;
  });

  // Tooltip data
  const tooltip = createMemo((): { x: number; y: number; value: string; time: string } | null => {
    const idx = hoveredIndex();
    if (idx === null) return null;
    const pt = mappedPoints()[idx];
    if (!pt) return null;
    return {
      x: pt.x,
      y: pt.y,
      value: `${formatVal()(pt.data.value)}${props.unit ? ` ${props.unit}` : ""}`,
      time: formatTm()(pt.data.timestamp),
    };
  });

  // Find closest point to mouse X
  function handleMouseMove(e: MouseEvent): void {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pts = mappedPoints();
    if (pts.length === 0) return;

    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dist = Math.abs(pts[i]!.x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setHoveredIndex(closestIdx);
  }

  function handleMouseLeave(): void {
    setHoveredIndex(null);
  }

  const gradientId = (): string => `metrics-gradient-${props.label.replace(/\s+/g, "-").toLowerCase()}`;
  const glowId = (): string => `metrics-glow-${props.label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div
      ref={containerRef}
      class="relative w-full select-none"
      style={{ height: `${chartHeight()}px` }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        width="100%"
        height={chartHeight()}
        viewBox={`0 0 ${containerWidth()} ${chartHeight()}`}
        preserveAspectRatio="none"
        class="overflow-visible"
      >
        <defs>
          {/* Gradient fill */}
          <linearGradient id={gradientId()} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color={props.color} stop-opacity="0.3" />
            <stop offset="100%" stop-color={props.color} stop-opacity="0.02" />
          </linearGradient>
          {/* Line glow filter */}
          <filter id={glowId()}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines (horizontal) */}
        <For each={yTicks()}>
          {(tick) => {
            const { min, max } = yDomain();
            const range = max - min || 1;
            const y = PADDING.top + plotHeight() - ((tick - min) / range) * plotHeight();
            return (
              <line
                x1={PADDING.left}
                x2={containerWidth() - PADDING.right}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                stroke-width="1"
              />
            );
          }}
        </For>

        {/* Y-axis labels */}
        <For each={yTicks()}>
          {(tick) => {
            const { min, max } = yDomain();
            const range = max - min || 1;
            const y = PADDING.top + plotHeight() - ((tick - min) / range) * plotHeight();
            return (
              <text
                x={PADDING.left - 10}
                y={y + 4}
                text-anchor="end"
                fill="rgba(255,255,255,0.3)"
                font-size="11"
                font-family="system-ui, -apple-system, sans-serif"
              >
                {formatVal()(tick)}
              </text>
            );
          }}
        </For>

        {/* X-axis labels */}
        <For each={xTicks()}>
          {(tick) => (
            <text
              x={tick.x}
              y={chartHeight() - 6}
              text-anchor="middle"
              fill="rgba(255,255,255,0.3)"
              font-size="11"
              font-family="system-ui, -apple-system, sans-serif"
            >
              {tick.label}
            </text>
          )}
        </For>

        {/* Gradient area fill */}
        <Show when={mappedPoints().length > 1}>
          <path
            d={areaPath()}
            fill={`url(#${gradientId()})`}
            opacity={animProgress()}
          />
        </Show>

        {/* Main line */}
        <Show when={mappedPoints().length > 1}>
          <path
            d={linePath()}
            fill="none"
            stroke={props.color}
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            filter={`url(#${glowId()})`}
            stroke-dasharray={animProgress() < 1 ? `${animProgress() * 5000} 5000` : "none"}
            opacity={Math.min(1, animProgress() * 1.5)}
          />
        </Show>

        {/* Hover vertical guideline */}
        <Show when={tooltip()}>
          {(t) => (
            <>
              <line
                x1={t().x}
                x2={t().x}
                y1={PADDING.top}
                y2={PADDING.top + plotHeight()}
                stroke="rgba(255,255,255,0.1)"
                stroke-width="1"
                stroke-dasharray="4 4"
              />
              {/* Hover dot */}
              <circle
                cx={t().x}
                cy={t().y}
                r="5"
                fill={props.color}
                stroke="#0a0a0a"
                stroke-width="2"
              />
              {/* Outer glow ring */}
              <circle
                cx={t().x}
                cy={t().y}
                r="10"
                fill="none"
                stroke={props.color}
                stroke-width="1"
                opacity="0.3"
              />
            </>
          )}
        </Show>
      </svg>

      {/* Tooltip overlay (HTML for better text rendering) */}
      <Show when={tooltip()}>
        {(t) => (
          <div
            class="pointer-events-none absolute z-20 flex flex-col items-center gap-0.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5"
            style={{
              left: `${Math.min(Math.max(t().x, 60), containerWidth() - 60)}px`,
              top: `${Math.max(t().y - 56, 0)}px`,
              transform: "translateX(-50%)",
              background: "var(--color-bg-elevated)",
              "backdrop-filter": "blur(12px)",
              "box-shadow": `0 4px 24px rgba(0,0,0,0.2)`,
            }}
          >
            <span class="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{t().value}</span>
            <span class="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{t().time}</span>
          </div>
        )}
      </Show>
    </div>
  );
}
