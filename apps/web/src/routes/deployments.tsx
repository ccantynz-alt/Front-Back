import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";

// ── Types ────────────────────────────────────────────────────────────

interface Deployment {
  id: string;
  branch: string;
  commit: string;
  status: "success" | "building" | "failed";
  url: string;
  timestamp: string;
  duration: string;
}

interface Domain {
  name: string;
  ssl: boolean;
  verified: boolean;
}

interface EnvVar {
  key: string;
  value: string;
  target: "production" | "preview" | "all";
}

// ── Mock Data ────────────────────────────────────────────────────────

const MOCK_DEPLOYS: Deployment[] = [
  { id: "d1", branch: "main", commit: "feat: add AI playground", status: "success", url: "https://crontech.dev", timestamp: "2 min ago", duration: "34s" },
  { id: "d2", branch: "feat/collab-v2", commit: "fix: CRDT sync race condition", status: "building", url: "https://feat-collab-v2.crontech.dev", timestamp: "just now", duration: "12s..." },
  { id: "d3", branch: "main", commit: "perf: reduce bundle by 8KB", status: "success", url: "https://crontech.dev", timestamp: "1 hour ago", duration: "28s" },
  { id: "d4", branch: "fix/auth-edge", commit: "fix: passkey timeout on slow networks", status: "success", url: "https://fix-auth-edge.crontech.dev", timestamp: "3 hours ago", duration: "31s" },
  { id: "d5", branch: "feat/video-collab", commit: "feat: multi-user video timeline", status: "failed", url: "", timestamp: "5 hours ago", duration: "45s" },
  { id: "d6", branch: "main", commit: "docs: update API reference", status: "success", url: "https://crontech.dev", timestamp: "8 hours ago", duration: "26s" },
  { id: "d7", branch: "feat/gpu-workers", commit: "feat: Modal.com inference workers", status: "success", url: "https://feat-gpu-workers.crontech.dev", timestamp: "12 hours ago", duration: "52s" },
];

const MOCK_DOMAINS: Domain[] = [
  { name: "crontech.dev", ssl: true, verified: true },
  { name: "www.crontech.dev", ssl: true, verified: true },
  { name: "app.crontech.dev", ssl: true, verified: true },
  { name: "api.crontech.dev", ssl: true, verified: false },
];

const MOCK_ENV: EnvVar[] = [
  { key: "TURSO_DATABASE_URL", value: "libsql://crontech-prod.turso.io", target: "production" },
  { key: "TURSO_AUTH_TOKEN", value: "eyJhbGciOiJFZERTQS...", target: "production" },
  { key: "OPENAI_API_KEY", value: "sk-proj-abc123...", target: "all" },
  { key: "STRIPE_SECRET_KEY", value: "sk_live_abc123...", target: "production" },
  { key: "GOOGLE_CLIENT_ID", value: "123456789.apps.googleusercontent.com", target: "all" },
];

const BUILD_LOG = `[09:25:10] Cloning repository...
[09:25:11] Installing dependencies via bun...
[09:25:12] bun install v1.3.9 - 1,776 packages installed [2.1s]
[09:25:14] Running build: vinxi build
[09:25:15] Building SolidStart application...
[09:25:16] Compiling 27 routes...
[09:25:18] Optimizing assets...
[09:25:19] Bundle size: 42.3 KB (under 50KB budget)
[09:25:20] Deploying to Cloudflare Pages...
[09:25:21] Deployed to 330+ edge locations
[09:25:22] Build complete in 12s`;

// ── Status Helpers ───────────────────────────────────────────────────

function statusColor(s: string): string {
  if (s === "success") return "text-emerald-400";
  if (s === "building") return "text-amber-400";
  return "text-red-400";
}

function statusIcon(s: string): string {
  if (s === "success") return "\u2713";
  if (s === "building") return "\u25CB";
  return "\u2717";
}

function statusBg(s: string): string {
  if (s === "success") return "bg-emerald-500/10 border-emerald-500/20";
  if (s === "building") return "bg-amber-500/10 border-amber-500/20 animate-pulse";
  return "bg-red-500/10 border-red-500/20";
}

// ── Component ────────────────────────────────────────────────────────

export default function DeploymentsPage(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<"deploys" | "domains" | "env" | "settings">("deploys");
  const [showAddDomain, setShowAddDomain] = createSignal(false);
  const [newDomain, setNewDomain] = createSignal("");
  const [showAddEnv, setShowAddEnv] = createSignal(false);
  const [newEnvKey, setNewEnvKey] = createSignal("");
  const [newEnvValue, setNewEnvValue] = createSignal("");
  const [showLog, setShowLog] = createSignal(true);
  const [deploying, setDeploying] = createSignal(false);
  const [envVars, setEnvVars] = createSignal(MOCK_ENV);
  const [domains, setDomains] = createSignal(MOCK_DOMAINS);
  const [copied, setCopied] = createSignal("");

  const tabs = [
    { id: "deploys" as const, label: "Deployments", count: MOCK_DEPLOYS.length },
    { id: "domains" as const, label: "Domains", count: MOCK_DOMAINS.length },
    { id: "env" as const, label: "Environment", count: MOCK_ENV.length },
    { id: "settings" as const, label: "Build Settings", count: 0 },
  ];

  function handleDeploy() {
    setDeploying(true);
    setTimeout(() => setDeploying(false), 3000);
  }

  function handleAddDomain() {
    if (newDomain().trim()) {
      setDomains([...domains(), { name: newDomain().trim(), ssl: false, verified: false }]);
      setNewDomain("");
      setShowAddDomain(false);
    }
  }

  function handleAddEnv() {
    if (newEnvKey().trim()) {
      setEnvVars([...envVars(), { key: newEnvKey().trim(), value: newEnvValue(), target: "all" }]);
      setNewEnvKey("");
      setNewEnvValue("");
      setShowAddEnv(false);
    }
  }

  function handleDeleteEnv(key: string) {
    setEnvVars(envVars().filter((v) => v.key !== key));
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <>
      <SEOHead title="Deployments" description="Manage deployments, domains, and environment variables." path="/deployments" />
      <div class="min-h-screen bg-[#060606] text-white">
        <div class="mx-auto max-w-7xl px-6 py-10">
          {/* Header */}
          <div class="mb-8 flex items-center justify-between">
            <div>
              <h1 class="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Deployments</h1>
              <p class="mt-1 text-sm text-gray-500">Deploy, monitor, and manage your production environment</p>
            </div>
            <div class="flex items-center gap-3">
              <button type="button" onClick={() => window.location.reload()} class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-white/[0.06]">Refresh</button>
              <button type="button" onClick={handleDeploy} class="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                {deploying() ? "Deploying..." : "Deploy Now"}
              </button>
            </div>
          </div>

          {/* Active Build Log */}
          <Show when={showLog()}>
            <div class="mb-8 rounded-2xl border border-amber-500/20 bg-black/60 overflow-hidden">
              <div class="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div class="flex items-center gap-3">
                  <span class="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                  <span class="text-xs font-semibold tracking-widest uppercase text-amber-400">Building</span>
                  <span class="text-xs text-gray-500">feat/collab-v2 &middot; fix: CRDT sync race condition</span>
                </div>
                <button type="button" onClick={() => setShowLog(false)} class="text-xs text-gray-500 hover:text-gray-300 transition">Hide</button>
              </div>
              <pre class="p-4 font-mono text-xs leading-relaxed text-emerald-400/80 max-h-48 overflow-y-auto">{BUILD_LOG}</pre>
            </div>
          </Show>

          {/* Tab Nav */}
          <div class="mb-6 flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
            <For each={tabs}>
              {(tab) => (
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  class={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab() === tab.id ? "bg-white/[0.08] text-white" : "text-gray-500 hover:text-gray-300"}`}
                >
                  {tab.label}
                  <Show when={tab.count > 0}>
                    <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-gray-400">{tab.count}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>

          {/* Deployments Tab */}
          <Show when={activeTab() === "deploys"}>
            <div class="space-y-3">
              <For each={MOCK_DEPLOYS}>
                {(deploy) => (
                  <div class={`rounded-xl border p-4 transition hover:bg-white/[0.02] ${statusBg(deploy.status)}`}>
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-4">
                        <span class={`text-lg font-bold ${statusColor(deploy.status)}`}>{statusIcon(deploy.status)}</span>
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-white">{deploy.commit}</span>
                            <span class="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-gray-400">{deploy.branch}</span>
                          </div>
                          <div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
                            <span>{deploy.timestamp}</span>
                            <span>&middot;</span>
                            <span>{deploy.duration}</span>
                            <Show when={deploy.url}>
                              <span>&middot;</span>
                              <button type="button" onClick={() => handleCopy(deploy.url, deploy.id)} class="text-blue-400 hover:underline">
                                {copied() === deploy.id ? "Copied!" : deploy.url}
                              </button>
                            </Show>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Show when={deploy.status === "success"}>
                          <button type="button" onClick={() => handleCopy(deploy.url, `rollback-${deploy.id}`)} class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-400 transition hover:text-white">Rollback</button>
                        </Show>
                        <Show when={deploy.status === "failed"}>
                          <button type="button" onClick={handleDeploy} class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20">Retry</button>
                        </Show>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Domains Tab */}
          <Show when={activeTab() === "domains"}>
            <div class="space-y-3">
              <div class="flex justify-end">
                <button type="button" onClick={() => setShowAddDomain(!showAddDomain())} class="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">Add Domain</button>
              </div>
              <Show when={showAddDomain()}>
                <div class="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <input type="text" placeholder="example.com" value={newDomain()} onInput={(e) => setNewDomain(e.currentTarget.value)} class="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50" />
                  <button type="button" onClick={handleAddDomain} class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Add</button>
                  <button type="button" onClick={() => setShowAddDomain(false)} class="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                </div>
              </Show>
              <For each={domains()}>
                {(domain) => (
                  <div class="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div class="flex items-center gap-3">
                      <span class={`text-sm ${domain.ssl ? "text-emerald-400" : "text-gray-600"}`}>{domain.ssl ? "\uD83D\uDD12" : "\uD83D\uDD13"}</span>
                      <span class="text-sm font-medium text-white">{domain.name}</span>
                      <span class={`rounded-full px-2 py-0.5 text-[10px] font-medium ${domain.verified ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {domain.verified ? "Verified" : "Pending DNS"}
                      </span>
                    </div>
                    <button type="button" onClick={() => setDomains(domains().filter((d) => d.name !== domain.name))} class="text-xs text-gray-600 hover:text-red-400 transition">Remove</button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Environment Variables Tab */}
          <Show when={activeTab() === "env"}>
            <div class="space-y-3">
              <div class="flex justify-end">
                <button type="button" onClick={() => setShowAddEnv(!showAddEnv())} class="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">Add Variable</button>
              </div>
              <Show when={showAddEnv()}>
                <div class="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <input type="text" placeholder="KEY" value={newEnvKey()} onInput={(e) => setNewEnvKey(e.currentTarget.value)} class="w-48 rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2 font-mono text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50" />
                  <input type="text" placeholder="value" value={newEnvValue()} onInput={(e) => setNewEnvValue(e.currentTarget.value)} class="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2 font-mono text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50" />
                  <button type="button" onClick={handleAddEnv} class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Add</button>
                  <button type="button" onClick={() => setShowAddEnv(false)} class="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                </div>
              </Show>
              <For each={envVars()}>
                {(env) => (
                  <div class="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div class="flex items-center gap-4">
                      <span class="font-mono text-sm font-semibold text-white">{env.key}</span>
                      <span class="font-mono text-sm text-gray-600">{"\u2022".repeat(16)}</span>
                      <span class="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-500">{env.target}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button type="button" onClick={() => handleCopy(env.value, env.key)} class="text-xs text-gray-500 hover:text-white transition">{copied() === env.key ? "Copied!" : "Copy"}</button>
                      <button type="button" onClick={() => handleDeleteEnv(env.key)} class="text-xs text-gray-600 hover:text-red-400 transition">Delete</button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Build Settings Tab */}
          <Show when={activeTab() === "settings"}>
            <div class="space-y-6">
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
                <h3 class="mb-4 text-sm font-semibold tracking-widest uppercase text-gray-400">Build Configuration</h3>
                <div class="space-y-4">
                  <div>
                    <label class="mb-1 block text-xs text-gray-500">Framework Preset</label>
                    <div class="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2.5 text-sm text-white">SolidStart (Vinxi)</div>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-gray-500">Build Command</label>
                    <div class="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2.5 font-mono text-sm text-white">vinxi build</div>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-gray-500">Output Directory</label>
                    <div class="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2.5 font-mono text-sm text-white">.output/</div>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-gray-500">Runtime</label>
                    <div class="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2.5 text-sm text-white">Bun 1.3.9</div>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-gray-500">Deploy Target</label>
                    <div class="rounded-lg border border-white/[0.08] bg-black/40 px-4 py-2.5 text-sm text-white">Cloudflare Pages + Workers (330+ edge locations)</div>
                  </div>
                </div>
              </div>
              <div class="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-6">
                <h3 class="mb-2 text-sm font-semibold text-red-400">Danger Zone</h3>
                <p class="mb-4 text-xs text-gray-500">Permanently delete this project and all its deployments.</p>
                <button type="button" onClick={() => window.confirm("Are you sure? This cannot be undone.") && console.log("Project deleted")} class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20">Delete Project</button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </>
  );
}
