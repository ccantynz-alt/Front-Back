import { Title } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { createSignal, Show, For } from "solid-js";
import type { JSX } from "solid-js";
import { Badge, Button, Input, Select } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { trpc } from "../../lib/trpc";
import { useMutation, friendlyError } from "../../lib/use-trpc";
import {
  getTemplateById,
  type ProjectTemplate,
} from "../../lib/project-templates";
import { useAuth } from "../../stores";

// ── Path picker ─────────────────────────────────────────────────────

type OnboardingPath = "picker" | "github" | "url";

// ── Constants ───────────────────────────────────────────────────────

const STEPS = ["Basics", "Configuration", "Domain"] as const;

const FRAMEWORK_OPTIONS = [
  { value: "solidstart", label: "SolidStart" },
  { value: "nextjs", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "astro", label: "Astro" },
  { value: "hono", label: "Hono" },
  { value: "vite", label: "Vite (SPA)" },
  { value: "static", label: "Static HTML" },
  { value: "other", label: "Other" },
];

const RUNTIME_OPTIONS = [
  { value: "bun", label: "Bun" },
  { value: "nodejs", label: "Node.js" },
  { value: "deno", label: "Deno" },
  { value: "edge", label: "Edge (Cloudflare Workers)" },
  { value: "static", label: "Static (no runtime)" },
];

// ── Step Indicator ──────────────────────────────────────────────────

interface StepIndicatorProps {
  currentStep: number;
}

function StepIndicator(props: StepIndicatorProps): JSX.Element {
  return (
    <div class="flex items-center gap-2">
      <For each={[...STEPS]}>
        {(label, index) => {
          const stepNum = index();
          const isActive = (): boolean => stepNum === props.currentStep;
          const isCompleted = (): boolean => stepNum < props.currentStep;

          return (
            <>
              <Show when={stepNum > 0}>
                <div
                  class="h-px w-8 transition-colors duration-300"
                  style={{
                    background: isCompleted()
                      ? "color-mix(in srgb, var(--color-primary) 60%, transparent)"
                      : "var(--color-border)",
                  }}
                />
              </Show>
              <div class="flex items-center gap-2">
                <div
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300"
                  style={{
                    background: isActive()
                      ? "linear-gradient(135deg, var(--color-primary), var(--color-accent, #06b6d4))"
                      : isCompleted()
                        ? "color-mix(in srgb, var(--color-primary) 30%, transparent)"
                        : "var(--color-border)",
                    color: isActive() || isCompleted() ? "var(--color-text)" : "var(--color-text-faint)",
                  }}
                >
                  <Show when={isCompleted()} fallback={<>{stepNum + 1}</>}>
                    {"✓"}
                  </Show>
                </div>
                <span
                  class="text-xs font-medium transition-colors duration-300"
                  style={{
                    color: isActive()
                      ? "var(--color-text)"
                      : isCompleted()
                        ? "var(--color-primary)"
                        : "var(--color-text-faint)",
                  }}
                >
                  {label}
                </span>
              </div>
            </>
          );
        }}
      </For>
    </div>
  );
}

// ── DNS Record Display ──────────────────────────────────────────────

function DnsInstructions(props: { domain: string }): JSX.Element {
  return (
    <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-5">
      <h4 class="mb-3 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        DNS Configuration
      </h4>
      <p class="mb-4 text-xs" style={{ color: "var(--color-text-faint)" }}>
        Add the following record to your domain's DNS provider to point{" "}
        <span class="font-mono" style={{ color: "var(--color-accent, #06b6d4)" }}>{props.domain}</span>{" "}
        to Crontech.
      </p>
      <div class="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)]">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-[var(--color-border)]">
              <th class="px-4 py-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>Type</th>
              <th class="px-4 py-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>Name</th>
              <th class="px-4 py-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>Value</th>
              <th class="px-4 py-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>TTL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="px-4 py-2 font-mono" style={{ color: "var(--color-primary)" }}>CNAME</td>
              <td class="px-4 py-2 font-mono" style={{ color: "var(--color-text-secondary)" }}>{props.domain}</td>
              <td class="px-4 py-2 font-mono" style={{ color: "var(--color-accent, #06b6d4)" }}>
                cname.crontech.ai
              </td>
              <td class="px-4 py-2" style={{ color: "var(--color-text-faint)" }}>Auto</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-[11px]" style={{ color: "var(--color-text-faint)" }}>
        DNS propagation can take up to 48 hours, but typically completes within
        minutes. SSL will be provisioned automatically.
      </p>
    </div>
  );
}

// ── URL helpers ─────────────────────────────────────────────────────

/**
 * Validates a pasted URL as http/https and returns its parsed URL object,
 * or null if it is not a valid http(s) URL.
 */
function parseWebUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept bare domains by prefixing https:// if no scheme is present
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Map a tRPC / network error into a friendly message for the URL flow.
 * Handles common cases: unreachable site, invalid URL, rate limit.
 */
function urlFlowErrorMessage(err: unknown): string {
  const base = friendlyError(err);
  const lower = base.toLowerCase();
  // TRPCClientError surfaces the server's error code/message verbatim.
  if (lower.includes("too many") || lower.includes("rate limit")) {
    return "You're going a bit fast. Please wait a moment and try again.";
  }
  if (lower.includes("unreachable") || lower.includes("could not reach") || lower.includes("timeout") || lower.includes("timed out") || lower.includes("fetch")) {
    return "We couldn't reach that site. Check the URL is live and publicly accessible, then try again.";
  }
  if (lower.includes("invalid") && lower.includes("url")) {
    return "That doesn't look like a valid website URL. Please check and try again.";
  }
  return base;
}

// ── New Project Page ────────────────────────────────────────────────

export default function NewProjectPage(): ReturnType<typeof ProtectedRoute> {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAuth();

  // ── Template (from ?template= query param) ──────────────────────
  const template = (): ProjectTemplate | undefined => {
    const raw = searchParams.template;
    const id = Array.isArray(raw) ? raw[0] : raw;
    return getTemplateById(id);
  };

  const initial = template();

  // ── Path picker state ───────────────────────────────────────────
  // If a template is present in the URL, skip the picker entirely and go
  // straight into the existing GitHub-repo wizard — templates are
  // inherently developer-flow.
  const [path, setPath] = createSignal<OnboardingPath>(
    initial ? "github" : "picker",
  );

  // ── Step state ──────────────────────────────────────────────────
  const [step, setStep] = createSignal(0);

  // ── Form state (pre-filled from the template when present) ──────
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal(
    initial ? initial.description : "",
  );
  const [repoUrl, setRepoUrl] = createSignal(initial ? initial.repoUrl : "");
  const [framework, setFramework] = createSignal(
    initial ? initial.framework : "",
  );
  const [buildCommand, setBuildCommand] = createSignal(
    initial ? initial.buildCommand : "",
  );
  const [runtime, setRuntime] = createSignal(initial ? initial.runtime : "");
  const [port, setPort] = createSignal("");
  const [customDomain, setCustomDomain] = createSignal("");

  // ── URL-acceleration path state ─────────────────────────────────
  const [pastedUrl, setPastedUrl] = createSignal("");
  const [urlError, setUrlError] = createSignal<string>("");
  const [acceleratedDomain, setAcceleratedDomain] = createSignal<string>("");

  // ── Validation ──────────────────────────────────────────────────
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  function validateStep(s: number): boolean {
    const errs: Record<string, string> = {};

    if (s === 0) {
      if (!name().trim()) errs["name"] = "Project name is required";
    }

    if (s === 1) {
      if (!framework()) errs["framework"] = "Please select a framework";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext(): void {
    if (validateStep(step())) {
      setStep(step() + 1);
    }
  }

  function goBack(): void {
    setErrors({});
    setStep(step() - 1);
  }

  // ── Mutation ────────────────────────────────────────────────────
  const createProject = useMutation(
    (input: {
      name: string;
      description?: string | undefined;
      repoUrl?: string | undefined;
      framework?: "solidstart" | "nextjs" | "remix" | "astro" | "hono" | "other" | undefined;
      buildCommand?: string | undefined;
      runtime?: "bun" | "node" | "deno" | undefined;
      port?: number | undefined;
      customDomain?: string | undefined;
    }) => trpc.projects.create.mutate(input),
    { invalidates: ["projects"] },
  );

  // ── URL-acceleration mutation ───────────────────────────────────
  // Calls the backend `projects.createFromUrl` tRPC procedure shipped in
  // commit 4f46f2a. We intentionally type the input loosely here — the
  // source-of-truth types live on the router. The runtime call is
  // validated server-side by Zod.
  const createFromUrl = useMutation(
    (input: { url: string }) =>
      (trpc.projects as unknown as {
        createFromUrl: { mutate: (i: { url: string }) => Promise<unknown> };
      }).createFromUrl.mutate(input),
    { invalidates: ["projects"] },
  );

  async function handleUrlSubmit(e?: Event): Promise<void> {
    if (e) e.preventDefault();
    setUrlError("");
    const parsed = parseWebUrl(pastedUrl());
    if (!parsed) {
      setUrlError(
        "Please enter a valid website URL (e.g. https://myshop.com).",
      );
      return;
    }
    try {
      await createFromUrl.mutate({ url: parsed.toString() });
      setAcceleratedDomain(parsed.hostname);
    } catch {
      // captured in createFromUrl.error()
    }
  }

  function resetUrlFlow(): void {
    createFromUrl.reset();
    setUrlError("");
  }

  async function handleCreate(): Promise<void> {
    if (!validateStep(step())) return;

    const portNum = port().trim() ? Number.parseInt(port(), 10) : undefined;
    const fw = framework() as "solidstart" | "nextjs" | "remix" | "astro" | "hono" | "other" | undefined;
    const input: Parameters<typeof createProject.mutate>[0] = {
      name: name().trim(),
      framework: fw || undefined,
    };

    if (description().trim()) input.description = description().trim();
    if (repoUrl().trim()) input.repoUrl = repoUrl().trim();
    if (buildCommand().trim()) input.buildCommand = buildCommand().trim();
    if (runtime()) input.runtime = runtime() as "bun" | "node" | "deno";
    if (portNum !== undefined && !Number.isNaN(portNum)) input.port = portNum;
    if (customDomain().trim()) input.customDomain = customDomain().trim();

    try {
      await createProject.mutate(input);
      navigate("/projects");
    } catch {
      // Error is captured in createProject.error()
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <ProtectedRoute>
      <SEOHead
        title="New Project"
        description="Create and deploy a new project on Crontech."
        path="/projects/new"
      />
      <Title>New Project — Crontech</Title>

      <div class="min-h-screen bg-[var(--color-bg)]">
        <div class="mx-auto max-w-2xl px-6 py-8 lg:px-8">
          {/* ── Breadcrumb ──────────────────────────────────────── */}
          <div class="mb-6 flex items-center gap-2 text-xs" style={{ color: "var(--color-text-faint)" }}>
            <A
              href="/projects"
              class="transition-colors hover:text-[var(--color-text-secondary)]"
            >
              Projects
            </A>
            <span>/</span>
            <span style={{ color: "var(--color-text-secondary)" }}>New</span>
          </div>

          {/* ── Header ──────────────────────────────────────────── */}
          <div class="mb-8">
            <h1 class="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
              Create a new project
            </h1>
            <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
              Configure and deploy to the Crontech edge network.
            </p>
            <Show when={template()}>
              {(t) => (
                <div class="mt-4 flex items-center gap-2">
                  <span
                    class="text-xl"
                    aria-hidden="true"
                  >
                    {t().icon}
                  </span>
                  <Badge variant="info" size="sm">
                    Creating from template: {t().name}
                  </Badge>
                </div>
              )}
            </Show>
          </div>

          {/* ── Path picker ──────────────────────────────────────── */}
          <Show when={path() === "picker"}>
            <div
              class="rounded-2xl border border-[var(--color-border)] p-6"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--color-bg-elevated) 90%, transparent) 0%, color-mix(in srgb, var(--color-bg) 95%, transparent) 100%)",
              }}
            >
              <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                How would you like to start?
              </h2>
              <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
                Pick the path that matches what you're bringing. You can always add more projects later.
              </p>

              <div class="mt-6 grid gap-4 md:grid-cols-2">
                {/* Option 1 — GitHub repo */}
                <button
                  type="button"
                  onClick={() => setPath("github")}
                  class="group flex flex-col items-start gap-3 rounded-xl border border-[var(--color-border)] p-5 text-left transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "color-mix(in srgb, var(--color-bg-elevated) 80%, transparent)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "color-mix(in srgb, var(--color-primary) 60%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-primary), var(--color-accent, #06b6d4))",
                      color: "var(--color-text)",
                    }}
                    aria-hidden="true"
                  >
                    {"</>"}
                  </div>
                  <div>
                    <h3 class="text-base font-semibold" style={{ color: "var(--color-text)" }}>
                      Connect a GitHub repo
                    </h3>
                    <p class="mt-1 text-xs" style={{ color: "var(--color-text-faint)" }}>
                      For developers. Point us at your repo, pick a framework, deploy to the edge.
                    </p>
                  </div>
                  <span
                    class="mt-auto text-xs font-medium"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Start the 3-step wizard &rarr;
                  </span>
                </button>

                {/* Option 2 — Accelerate an existing site */}
                <button
                  type="button"
                  onClick={() => setPath("url")}
                  class="group flex flex-col items-start gap-3 rounded-xl border border-[var(--color-border)] p-5 text-left transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "color-mix(in srgb, var(--color-bg-elevated) 80%, transparent)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "color-mix(in srgb, var(--color-primary) 60%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-accent, #06b6d4), var(--color-primary))",
                      color: "var(--color-text)",
                    }}
                    aria-hidden="true"
                  >
                    {"→"}
                  </div>
                  <div>
                    <h3 class="text-base font-semibold" style={{ color: "var(--color-text)" }}>
                      Accelerate an existing website
                    </h3>
                    <p class="mt-1 text-xs" style={{ color: "var(--color-text-faint)" }}>
                      For WordPress, WooCommerce, Shopify & more. Paste your URL — we take it from there.
                    </p>
                  </div>
                  <span
                    class="mt-auto text-xs font-medium"
                    style={{ color: "var(--color-accent, #06b6d4)" }}
                  >
                    Paste a URL &rarr;
                  </span>
                </button>
              </div>

              <div class="mt-8 flex items-center justify-between">
                <A href="/projects">
                  <Button variant="ghost" size="md">
                    Cancel
                  </Button>
                </A>
              </div>
            </div>
          </Show>

          {/* ── URL-acceleration flow ────────────────────────────── */}
          <Show when={path() === "url"}>
            <div
              class="rounded-2xl border border-[var(--color-border)] p-6"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--color-bg-elevated) 90%, transparent) 0%, color-mix(in srgb, var(--color-bg) 95%, transparent) 100%)",
              }}
            >
              {/* Success confirmation */}
              <Show
                when={acceleratedDomain()}
                fallback={
                  <form
                    onSubmit={handleUrlSubmit}
                    class="flex flex-col gap-5"
                    noValidate
                  >
                    <div>
                      <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                        Paste your website URL
                      </h2>
                      <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
                        We'll fingerprint the stack, queue the acceleration, and email you at{" "}
                        <span class="font-mono" style={{ color: "var(--color-accent, #06b6d4)" }}>
                          {auth.currentUser()?.email ?? "your account email"}
                        </span>{" "}
                        the moment it's live.
                      </p>
                    </div>

                    <Input
                      label="Website URL"
                      placeholder="https://myshop.com"
                      type="url"
                      autocomplete="url"
                      value={pastedUrl()}
                      onInput={(e) => {
                        setPastedUrl(e.currentTarget.value);
                        if (urlError()) setUrlError("");
                      }}
                      error={urlError()}
                    />

                    <Show when={createFromUrl.error() && !urlError()}>
                      <div
                        class="rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-4 py-3 text-sm"
                        style={{ color: "var(--color-danger)" }}
                      >
                        {urlFlowErrorMessage(createFromUrl.error())}
                      </div>
                    </Show>

                    <div class="mt-2 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="md"
                        type="button"
                        onClick={() => {
                          resetUrlFlow();
                          setPath("picker");
                        }}
                      >
                        Back
                      </Button>

                      <Show
                        when={createFromUrl.error()}
                        fallback={
                          <Button
                            variant="primary"
                            size="md"
                            type="submit"
                            loading={createFromUrl.loading()}
                            disabled={createFromUrl.loading()}
                          >
                            Accelerate this site
                          </Button>
                        }
                      >
                        <Button
                          variant="primary"
                          size="md"
                          type="submit"
                          loading={createFromUrl.loading()}
                          disabled={createFromUrl.loading()}
                        >
                          Try again
                        </Button>
                      </Show>
                    </div>
                  </form>
                }
              >
                <div class="flex flex-col gap-5">
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-primary), var(--color-accent, #06b6d4))",
                        color: "var(--color-text)",
                      }}
                      aria-hidden="true"
                    >
                      {"✓"}
                    </div>
                    <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                      You're in the queue
                    </h2>
                  </div>

                  <p class="text-sm" style={{ color: "var(--color-text-faint)" }}>
                    We're accelerating{" "}
                    <span
                      class="font-mono"
                      style={{ color: "var(--color-accent, #06b6d4)" }}
                    >
                      {acceleratedDomain()}
                    </span>
                    . You'll get an email at{" "}
                    <span class="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                      {auth.currentUser()?.email ?? "your account email"}
                    </span>{" "}
                    when it's live. In the meantime, your dashboard is ready.
                  </p>

                  <div class="mt-2 flex items-center justify-end">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => navigate("/projects")}
                    >
                      Go to dashboard
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* ── GitHub repo wizard (existing 3-step flow) ─────────── */}
          <Show when={path() === "github"}>
          {/* ── Step Indicator ───────────────────────────────────── */}
          <div class="mb-8">
            <StepIndicator currentStep={step()} />
          </div>

          {/* ── Step Content ─────────────────────────────────────── */}
          <div
            class="rounded-2xl border border-[var(--color-border)] p-6"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-bg-elevated) 90%, transparent) 0%, color-mix(in srgb, var(--color-bg) 95%, transparent) 100%)",
            }}
          >
            {/* Step 0: Basics */}
            <Show when={step() === 0}>
              <div class="flex flex-col gap-5">
                <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Project basics
                </h2>

                <Input
                  label="Project name"
                  placeholder="my-awesome-app"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  error={errors()["name"]}
                />

                <div class="input-wrapper">
                  <label class="input-label" for="new-project-description">Description (optional)</label>
                  <textarea
                    id="new-project-description"
                    class="textarea"
                    placeholder="A brief description of what this project does"
                    rows={3}
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    style={{ resize: "vertical" }}
                  />
                </div>

                <Input
                  label="Repository URL (optional)"
                  placeholder="https://github.com/you/repo"
                  value={repoUrl()}
                  onInput={(e) => setRepoUrl(e.currentTarget.value)}
                />
              </div>
            </Show>

            {/* Step 1: Configuration */}
            <Show when={step() === 1}>
              <div class="flex flex-col gap-5">
                <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Build configuration
                </h2>

                <Select
                  label="Framework"
                  placeholder="Select a framework"
                  options={FRAMEWORK_OPTIONS}
                  value={framework()}
                  onChange={setFramework}
                  error={errors()["framework"]}
                  name="framework"
                />

                <Input
                  label="Build command (optional)"
                  placeholder="bun run build"
                  value={buildCommand()}
                  onInput={(e) => setBuildCommand(e.currentTarget.value)}
                />

                <Select
                  label="Runtime"
                  placeholder="Select runtime"
                  options={RUNTIME_OPTIONS}
                  value={runtime()}
                  onChange={setRuntime}
                  name="runtime"
                />

                <Input
                  label="Port (optional)"
                  placeholder="3000"
                  type="number"
                  value={port()}
                  onInput={(e) => setPort(e.currentTarget.value)}
                />
              </div>
            </Show>

            {/* Step 2: Domain */}
            <Show when={step() === 2}>
              <div class="flex flex-col gap-5">
                <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  Custom domain
                </h2>
                <p class="text-sm" style={{ color: "var(--color-text-faint)" }}>
                  You can add a custom domain now or later from project settings.
                  A <span class="font-mono" style={{ color: "var(--color-accent, #06b6d4)" }}>.crontech.app</span> subdomain
                  will be assigned automatically.
                </p>

                <Input
                  label="Custom domain (optional)"
                  placeholder="app.yourdomain.com"
                  value={customDomain()}
                  onInput={(e) => setCustomDomain(e.currentTarget.value)}
                />

                <Show when={customDomain().trim().length > 0}>
                  <DnsInstructions domain={customDomain().trim()} />
                </Show>
              </div>
            </Show>

            {/* ── Error display ──────────────────────────────────── */}
            <Show when={createProject.error()}>
              <div class="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-4 py-3 text-sm" style={{ color: "var(--color-danger)" }}>
                {friendlyError(createProject.error())}
              </div>
            </Show>

            {/* ── Navigation buttons ─────────────────────────────── */}
            <div class="mt-8 flex items-center justify-between">
              <Show
                when={step() > 0}
                fallback={
                  <Show
                    when={!initial}
                    fallback={
                      <A href="/projects">
                        <Button variant="ghost" size="md">
                          Cancel
                        </Button>
                      </A>
                    }
                  >
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        setErrors({});
                        setPath("picker");
                      }}
                    >
                      Back
                    </Button>
                  </Show>
                }
              >
                <Button variant="ghost" size="md" onClick={goBack}>
                  Back
                </Button>
              </Show>

              <Show
                when={step() < STEPS.length - 1}
                fallback={
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleCreate}
                    loading={createProject.loading()}
                    disabled={createProject.loading()}
                  >
                    Create Project
                  </Button>
                }
              >
                <Button variant="primary" size="md" onClick={goNext}>
                  Next
                </Button>
              </Show>
            </div>
          </div>
          </Show>
        </div>
      </div>
    </ProtectedRoute>
  );
}
