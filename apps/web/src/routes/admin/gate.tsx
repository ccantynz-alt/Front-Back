// ── /admin/gate — iPad Command Center ────────────────────────────────
//
// Secure admin command center optimised for iPad and touch devices.
// Full-viewport, dark theme, all tap targets ≥ 48px.
//
// Layout:
//   1. Sticky header (64px) — wordmark · COMMAND GATE label · live clock
//   2. Status banner (48px) — system health derived from metrics.pulse
//   3. Primary grid (flex-1) — Platform Vitals (A) + Quick Actions (B)
//   4. Footer (48px) — crontech.ai · admin gate · {date}
//
// Authorised as a free-action admin sub-route (CLAUDE.md §0.7).
// Wraps in <AdminRoute> like every other /admin/* page.
//
// Data:
//   • trpc.metrics.pulse (agentCount, meshHealthy, revenueCents, uptimeSeconds)
//   • trpc.analytics.getUsageStats (recentEvents)

import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import {
  For,
  type JSX,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { trpc } from "~/lib/trpc";
import { AdminRoute } from "../../components/AdminRoute";

// ── Types ─────────────────────────────────────────────────────────────

interface PulseSnapshot {
  agentCount: number;
  meshHealthy: boolean;
  revenueCents: number;
  uptimeSeconds: number;
}

type BannerLevel = "healthy" | "degraded";

// ── Pure helpers ──────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "0m";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRevenue(cents: number): string {
  if (cents === 0) return "$0.00";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/** Relative time string for an event timestamp. */
function relativeTime(ts: Date | null | undefined): string {
  if (!ts) return "?";
  const diffMs = Date.now() - ts.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

// ── Page shell ────────────────────────────────────────────────────────

export default function AdminGatePage(): JSX.Element {
  return (
    <AdminRoute>
      <GateContent />
    </AdminRoute>
  );
}

// ── Content ───────────────────────────────────────────────────────────

function GateContent(): JSX.Element {
  // ── Live clock ──────────────────────────────────────────────────────
  const [now, setNow] = createSignal(new Date());

  onMount(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    onCleanup(() => clearInterval(t));
  });

  const timeStr = createMemo(() => now().toLocaleTimeString("en-NZ", { hour12: false }));

  // ── Metrics poll (every 30 s) ───────────────────────────────────────
  const [tick, setTick] = createSignal(0);

  onMount(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 30_000);
    onCleanup(() => clearInterval(iv));
  });

  const [pulse] = createResource(tick, async (): Promise<PulseSnapshot | null> => {
    try {
      return await trpc.metrics.pulse.query();
    } catch {
      return null;
    }
  });

  const [stats] = createResource(tick, async () => {
    try {
      return await trpc.analytics.getUsageStats.query();
    } catch {
      return null;
    }
  });

  // ── Derived signals ─────────────────────────────────────────────────
  const snap = (): PulseSnapshot | null => pulse() ?? null;

  const bannerLevel = (): BannerLevel => {
    const s = snap();
    if (!s) return "degraded";
    return s.meshHealthy ? "healthy" : "degraded";
  };

  const recentEvents = createMemo(() => {
    const s = stats();
    if (!s) return [];
    return s.recentEvents.slice(0, 3);
  });

  // ── Footer date ─────────────────────────────────────────────────────
  const footerDate = now().toISOString().slice(0, 10);

  return (
    <div class="flex min-h-screen flex-col" style={{ background: "var(--color-bg)" }}>
      <Title>Command Gate — Crontech Admin</Title>

      {/* ── 1. Sticky header (64px) ── */}
      <header
        class="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6"
        style={{
          background: "var(--color-bg)",
          "border-color": "var(--color-border)",
        }}
      >
        {/* Wordmark */}
        <span
          class="font-mono text-xs font-semibold tracking-widest"
          style={{ color: "var(--color-text)" }}
          aria-label="Crontech"
        >
          CRONTECH
        </span>

        {/* Centre label */}
        <span
          class="text-xs tracking-widest"
          style={{ color: "var(--color-text-faint)" }}
          aria-label="Command Gate"
        >
          COMMAND GATE
        </span>

        {/* Live clock */}
        <span
          class="font-mono text-xs tabular-nums"
          style={{ color: "var(--color-text-secondary)" }}
          aria-live="polite"
          aria-label="Current time"
        >
          {timeStr()}
        </span>
      </header>

      {/* ── 2. Status banner (48px) ── */}
      <StatusBanner level={bannerLevel()} />

      {/* ── 3. Primary grid (flex-1) ── */}
      <main class="flex flex-1 flex-col gap-4 p-4 sm:p-6 md:grid md:grid-cols-2 md:items-start">
        {/* Column A — Platform Vitals */}
        <section aria-label="Platform Vitals">
          <h2
            class="mb-3 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-faint)" }}
          >
            Platform Vitals
          </h2>

          <div class="flex flex-col gap-3">
            {/* Active Agents */}
            <VitalCard
              label="Active Agents"
              value={snap() !== null ? String(snap()?.agentCount ?? 0) : "—"}
              loading={pulse.loading}
            />

            {/* Uptime */}
            <VitalCard
              label="Uptime"
              value={snap() !== null ? formatUptime(snap()?.uptimeSeconds ?? 0) : "—"}
              loading={pulse.loading}
            />

            {/* Revenue */}
            <VitalCard
              label="Revenue"
              value={snap() !== null ? formatRevenue(snap()?.revenueCents ?? 0) : "—"}
              loading={pulse.loading}
            />

            {/* Recent Activity */}
            <div
              class="rounded-2xl p-4"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <p
                class="mb-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-text-faint)" }}
              >
                Recent Activity
              </p>

              <Show
                when={!stats.loading}
                fallback={
                  <div
                    class="h-16 w-full animate-pulse rounded-lg"
                    style={{ background: "var(--color-bg-subtle)" }}
                    aria-busy="true"
                    aria-label="Loading recent activity"
                  />
                }
              >
                <Show
                  when={recentEvents().length > 0}
                  fallback={
                    <p class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                      No recent events
                    </p>
                  }
                >
                  <ul class="flex flex-col gap-2" aria-label="Recent events">
                    <For each={recentEvents()}>
                      {(ev) => (
                        <li
                          class="flex items-center justify-between gap-2 text-xs"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          <span class="font-mono" style={{ color: "var(--color-text)" }}>
                            {ev.category ?? ev.event}
                          </span>
                          <span style={{ color: "var(--color-text-faint)" }}>
                            {relativeTime(ev.timestamp)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
            </div>
          </div>
        </section>

        {/* Column B — Quick Actions */}
        <section aria-label="Quick Actions">
          <h2
            class="mb-3 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-faint)" }}
          >
            Quick Actions
          </h2>

          <div class="flex flex-col gap-2">
            <ActionButton href="/settings?tab=api-keys" icon="🔑" label="Issue API Key" />
            <ActionButton href="/projects/new" icon="📁" label="New Project" />
            <ActionButton href="/builder" icon="🎨" label="Open Builder" />
            <ActionButton href="/admin/pulse" icon="📡" label="Sovereign Pulse" />
            <ActionButton href="/deployments" icon="🚀" label="View Deployments" />
          </div>
        </section>
      </main>

      {/* ── 4. Footer (48px) ── */}
      <footer
        class="flex h-12 shrink-0 items-center justify-center border-t text-xs"
        style={{
          "border-color": "var(--color-border)",
          color: "var(--color-text-faint)",
        }}
      >
        crontech.ai · admin gate · {footerDate}
      </footer>
    </div>
  );
}

// ── StatusBanner ──────────────────────────────────────────────────────

interface StatusBannerProps {
  level: BannerLevel;
}

function StatusBanner(props: StatusBannerProps): JSX.Element {
  const isHealthy = (): boolean => props.level === "healthy";

  return (
    <output
      class={`flex h-12 shrink-0 items-center justify-center text-xs font-semibold tracking-widest ${
        isHealthy() ? "bg-emerald-950 text-emerald-400" : "bg-amber-950 text-amber-400"
      }`}
      aria-live="polite"
      aria-label={`System status: ${isHealthy() ? "All systems operational" : "Degraded mode"}`}
    >
      {isHealthy() ? "ALL SYSTEMS OPERATIONAL" : "DEGRADED MODE"}
    </output>
  );
}

// ── VitalCard ─────────────────────────────────────────────────────────

interface VitalCardProps {
  label: string;
  value: string;
  loading: boolean;
}

function VitalCard(props: VitalCardProps): JSX.Element {
  return (
    <div
      class="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p
        class="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-text-faint)" }}
      >
        {props.label}
      </p>

      <Show
        when={!props.loading}
        fallback={
          <div
            class="h-6 w-20 animate-pulse rounded-md"
            style={{ background: "var(--color-bg-subtle)" }}
            aria-busy="true"
            aria-label="Loading"
          />
        }
      >
        <span class="text-xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
          {props.value}
        </span>
      </Show>
    </div>
  );
}

// ── ActionButton ──────────────────────────────────────────────────────

interface ActionButtonProps {
  href: string;
  icon: string;
  label: string;
}

function ActionButton(props: ActionButtonProps): JSX.Element {
  return (
    <A
      href={props.href}
      class="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors duration-150"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-secondary)",
      }}
      aria-label={props.label}
    >
      <span aria-hidden="true" class="text-lg leading-none">
        {props.icon}
      </span>
      <span>{props.label}</span>
    </A>
  );
}
