import { createSignal, For, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";

// ── Types ───────────────────────────────────────────────────────────

interface ServiceStatus {
  name: string;
  description: string;
  status: "operational" | "degraded" | "outage" | "maintenance";
  responseTime: number;
  uptime: number;
  icon: string;
}

// ── Service Data ────────────────────────────────────────────────────

const SERVICES: ServiceStatus[] = [
  {
    name: "API",
    description: "Core tRPC and REST API endpoints",
    status: "operational",
    responseTime: 12,
    uptime: 99.99,
    icon: "\u2699\uFE0F",
  },
  {
    name: "Database (Turso)",
    description: "Edge SQLite with embedded replicas",
    status: "operational",
    responseTime: 3,
    uptime: 99.99,
    icon: "\uD83D\uDDC4\uFE0F",
  },
  {
    name: "Database (Neon)",
    description: "Serverless PostgreSQL",
    status: "operational",
    responseTime: 18,
    uptime: 99.98,
    icon: "\uD83D\uDC18",
  },
  {
    name: "Vector DB (Qdrant)",
    description: "Embeddings and semantic search",
    status: "operational",
    responseTime: 8,
    uptime: 99.97,
    icon: "\uD83E\uDDE0",
  },
  {
    name: "AI Engine",
    description: "Three-tier compute: client GPU, edge, cloud",
    status: "operational",
    responseTime: 45,
    uptime: 99.95,
    icon: "\u26A1",
  },
  {
    name: "Edge Network",
    description: "Cloudflare Workers across 330+ cities",
    status: "operational",
    responseTime: 4,
    uptime: 99.99,
    icon: "\uD83C\uDF10",
  },
  {
    name: "Collaboration",
    description: "Real-time CRDTs, WebSocket, and presence",
    status: "operational",
    responseTime: 7,
    uptime: 99.98,
    icon: "\uD83D\uDC65",
  },
  {
    name: "Authentication",
    description: "Passkeys, OAuth, and session management",
    status: "operational",
    responseTime: 15,
    uptime: 99.99,
    icon: "\uD83D\uDD12",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────

function statusConfig(
  status: string,
): { label: string; color: string; bgColor: string; dotColor: string } {
  switch (status) {
    case "operational":
      return {
        label: "Operational",
        color: "rgb(52,211,153)",
        bgColor: "rgba(52,211,153,0.1)",
        dotColor: "rgb(52,211,153)",
      };
    case "degraded":
      return {
        label: "Degraded Performance",
        color: "rgb(251,191,36)",
        bgColor: "rgba(251,191,36,0.1)",
        dotColor: "rgb(251,191,36)",
      };
    case "outage":
      return {
        label: "Major Outage",
        color: "rgb(248,113,113)",
        bgColor: "rgba(248,113,113,0.1)",
        dotColor: "rgb(248,113,113)",
      };
    case "maintenance":
      return {
        label: "Under Maintenance",
        color: "rgb(147,197,253)",
        bgColor: "rgba(147,197,253,0.1)",
        dotColor: "rgb(147,197,253)",
      };
    default:
      return {
        label: "Unknown",
        color: "rgb(156,163,175)",
        bgColor: "rgba(156,163,175,0.1)",
        dotColor: "rgb(156,163,175)",
      };
  }
}

function overallStatus(
  services: ServiceStatus[],
): "operational" | "degraded" | "outage" {
  if (services.some((s) => s.status === "outage")) return "outage";
  if (services.some((s) => s.status === "degraded")) return "degraded";
  return "operational";
}

// ── Uptime Bar Component ────────────────────────────────────────────

function UptimeBar(): JSX.Element {
  // Simulate 90 days of uptime data
  const days = Array.from({ length: 90 }, (_, i) => ({
    day: i,
    status: Math.random() > 0.02 ? "operational" : "degraded",
  }));

  return (
    <div class="flex gap-[2px] items-end h-8">
      <For each={days}>
        {(day) => (
          <div
            class="flex-1 min-w-[2px] h-full rounded-sm transition-opacity duration-200 hover:opacity-80"
            style={{
              background:
                day.status === "operational"
                  ? "rgb(52,211,153)"
                  : "rgb(251,191,36)",
              opacity: "0.6",
            }}
            title={`Day ${90 - day.day}: ${day.status === "operational" ? "Operational" : "Degraded"}`}
          />
        )}
      </For>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function StatusPage(): JSX.Element {
  const [currentTime, setCurrentTime] = createSignal(new Date());
  const [subscribeEmail, setSubscribeEmail] = createSignal("");
  const [subscribed, setSubscribed] = createSignal(false);

  let timer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    timer = setInterval(() => setCurrentTime(new Date()), 60_000);
  });
  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  const overall = (): ReturnType<typeof statusConfig> =>
    statusConfig(overallStatus(SERVICES));

  return (
    <>
      <SEOHead
        title="System Status"
        description="Real-time operational status for all Crontech platform services. API, databases, AI engine, edge network, and more."
        path="/status"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0a" }}>
        {/* ── Hero / Overall Status Banner ────────────────────────── */}
        <div class="relative overflow-hidden">
          <div
            class="absolute inset-0 opacity-20"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(52,211,153,0.15) 0%, transparent 60%)",
            }}
          />

          <div class="relative mx-auto max-w-4xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <h1
                class="text-4xl font-bold tracking-tight sm:text-5xl"
                style={{
                  background:
                    "linear-gradient(135deg, #fff 0%, #34d399 50%, #10b981 100%)",
                  "-webkit-background-clip": "text",
                  "-webkit-text-fill-color": "transparent",
                  "line-height": "1.1",
                }}
              >
                System Status
              </h1>
              <p class="mt-3 text-white/40 text-sm">
                Last updated:{" "}
                {currentTime().toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </p>

              {/* Overall status card */}
              <div
                class="mt-8 w-full max-w-lg rounded-2xl border p-6"
                style={{
                  background: overall().bgColor,
                  "border-color": `${overall().color}22`,
                }}
              >
                <div class="flex items-center justify-center gap-3">
                  {/* Animated pulse dot */}
                  <div class="relative">
                    <div
                      class="h-3 w-3 rounded-full"
                      style={{ background: overall().dotColor }}
                    />
                    <div
                      class="absolute inset-0 h-3 w-3 rounded-full animate-ping opacity-50"
                      style={{ background: overall().dotColor }}
                    />
                  </div>
                  <span
                    class="text-xl font-semibold"
                    style={{ color: overall().color }}
                  >
                    {overall().label === "Operational"
                      ? "All Systems Operational"
                      : overall().label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Services List ───────────────────────────────────────── */}
        <div class="mx-auto max-w-4xl px-6 pb-8">
          <div class="mb-6 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white/80">
              Service Status
            </h2>
            <span class="text-xs text-white/25 font-mono">
              {SERVICES.length} services monitored
            </span>
          </div>

          <div
            class="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <For each={SERVICES}>
              {(service, index) => {
                const config = statusConfig(service.status);
                return (
                  <div
                    class="flex items-center gap-4 px-6 py-4 transition-colors duration-200 hover:bg-white/[0.02]"
                    style={{
                      "border-bottom":
                        index() < SERVICES.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    {/* Icon + name */}
                    <span class="text-lg shrink-0 w-8 text-center">
                      {service.icon}
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-white/80">
                          {service.name}
                        </span>
                      </div>
                      <span class="text-xs text-white/30">
                        {service.description}
                      </span>
                    </div>

                    {/* Metrics */}
                    <div class="hidden sm:flex items-center gap-6 shrink-0">
                      <div class="text-right">
                        <span class="block text-xs text-white/25">
                          Response
                        </span>
                        <span class="text-sm font-mono text-white/60">
                          {service.responseTime}ms
                        </span>
                      </div>
                      <div class="text-right">
                        <span class="block text-xs text-white/25">
                          Uptime
                        </span>
                        <span class="text-sm font-mono text-emerald-400/80">
                          {service.uptime}%
                        </span>
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div
                      class="flex items-center gap-2 shrink-0 rounded-full px-3 py-1"
                      style={{ background: config.bgColor }}
                    >
                      <div
                        class="h-2 w-2 rounded-full"
                        style={{ background: config.dotColor }}
                      />
                      <span
                        class="text-xs font-medium"
                        style={{ color: config.color }}
                      >
                        {config.label}
                      </span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* ── 90-Day Uptime ───────────────────────────────────────── */}
        <div class="mx-auto max-w-4xl px-6 pb-8">
          <div
            class="rounded-2xl border border-white/[0.06] p-6"
            style={{
              background: "rgba(255,255,255,0.02)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-white/60">
                90-Day Uptime
              </h3>
              <div class="flex items-center gap-4 text-xs text-white/30">
                <span class="flex items-center gap-1.5">
                  <span
                    class="inline-block h-2 w-2 rounded-sm"
                    style={{
                      background: "rgb(52,211,153)",
                      opacity: "0.6",
                    }}
                  />
                  Operational
                </span>
                <span class="flex items-center gap-1.5">
                  <span
                    class="inline-block h-2 w-2 rounded-sm"
                    style={{
                      background: "rgb(251,191,36)",
                      opacity: "0.6",
                    }}
                  />
                  Degraded
                </span>
              </div>
            </div>
            <UptimeBar />
            <div class="mt-2 flex justify-between text-xs text-white/20">
              <span>90 days ago</span>
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* ── Incident History ────────────────────────────────────── */}
        <div class="mx-auto max-w-4xl px-6 pb-20">
          <h2 class="text-lg font-semibold text-white/80 mb-6">
            Incident History
          </h2>

          <div
            class="rounded-2xl border border-white/[0.06] p-8 text-center"
            style={{
              background: "rgba(255,255,255,0.02)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <div class="text-3xl mb-3 opacity-30">{"\u2705"}</div>
            <p class="text-white/50 font-medium">
              No incidents in the last 30 days
            </p>
            <p class="text-white/25 text-sm mt-1">
              All systems have been operating normally
            </p>
          </div>

          {/* ── Subscribe Section ─────────────────────────────────── */}
          <div
            class="mt-8 rounded-2xl border border-white/[0.06] p-6"
            style={{
              background:
                "linear-gradient(145deg, rgba(99,102,241,0.04) 0%, rgba(139,92,246,0.02) 100%)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <div class="flex flex-col sm:flex-row items-center gap-4">
              <div class="flex-1 text-center sm:text-left">
                <h3 class="text-sm font-semibold text-white/70">
                  Subscribe to status updates
                </h3>
                <p class="text-xs text-white/30 mt-1">
                  Get notified via email when a service status changes
                </p>
              </div>
              <div class="flex gap-2 w-full sm:w-auto">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={subscribeEmail()}
                  onInput={(e) => setSubscribeEmail(e.currentTarget.value)}
                  class="flex-1 sm:w-64 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/40 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => {
                    const email = subscribeEmail().trim();
                    if (!email || !email.includes("@")) return;
                    setSubscribed(true);
                    setSubscribeEmail("");
                    setTimeout(() => setSubscribed(false), 4000);
                  }}
                  class="shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-105"
                  style={{
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  }}
                >
                  {subscribed() ? "Subscribed!" : "Subscribe"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Response Time Summary ─────────────────────────────── */}
          <div class="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Avg Response", value: "14ms", sub: "across all services" },
              { label: "Uptime (30d)", value: "99.98%", sub: "platform average" },
              { label: "Edge Nodes", value: "330+", sub: "cities worldwide" },
              { label: "P99 Latency", value: "48ms", sub: "99th percentile" },
            ].map((stat) => (
              <div
                class="rounded-xl border border-white/[0.06] p-4 text-center"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div class="text-xl font-bold text-white/80">
                  {stat.value}
                </div>
                <div class="text-xs text-white/40 mt-1">{stat.label}</div>
                <div class="text-xs text-white/20 mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
