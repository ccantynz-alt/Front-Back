import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createSignal, Show, For } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Input, Select } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { trpc } from "../../lib/trpc";
import { useMutation, friendlyError } from "../../lib/use-trpc";

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
                      ? "rgba(139, 92, 246, 0.6)"
                      : "rgba(255, 255, 255, 0.06)",
                  }}
                />
              </Show>
              <div class="flex items-center gap-2">
                <div
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300"
                  style={{
                    background: isActive()
                      ? "linear-gradient(135deg, #8b5cf6, #06b6d4)"
                      : isCompleted()
                        ? "rgba(139, 92, 246, 0.3)"
                        : "rgba(255, 255, 255, 0.06)",
                    color: isActive() || isCompleted() ? "#fff" : "#6b7280",
                  }}
                >
                  <Show when={isCompleted()} fallback={<>{stepNum + 1}</>}>
                    {"\u2713"}
                  </Show>
                </div>
                <span
                  class="text-xs font-medium transition-colors duration-300"
                  style={{
                    color: isActive()
                      ? "#fff"
                      : isCompleted()
                        ? "#a78bfa"
                        : "#6b7280",
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
    <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h4 class="mb-3 text-sm font-semibold text-white">
        DNS Configuration
      </h4>
      <p class="mb-4 text-xs text-gray-500">
        Add the following record to your domain's DNS provider to point{" "}
        <span class="font-mono text-cyan-400">{props.domain}</span>{" "}
        to Crontech.
      </p>
      <div class="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-white/[0.06]">
              <th class="px-4 py-2 font-semibold text-gray-400">Type</th>
              <th class="px-4 py-2 font-semibold text-gray-400">Name</th>
              <th class="px-4 py-2 font-semibold text-gray-400">Value</th>
              <th class="px-4 py-2 font-semibold text-gray-400">TTL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="px-4 py-2 font-mono text-violet-400">CNAME</td>
              <td class="px-4 py-2 font-mono text-gray-300">{props.domain}</td>
              <td class="px-4 py-2 font-mono text-cyan-400">
                cname.crontech.ai
              </td>
              <td class="px-4 py-2 text-gray-500">Auto</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-[11px] text-gray-600">
        DNS propagation can take up to 48 hours, but typically completes within
        minutes. SSL will be provisioned automatically.
      </p>
    </div>
  );
}

// ── New Project Page ────────────────────────────────────────────────

export default function NewProjectPage(): ReturnType<typeof ProtectedRoute> {
  const navigate = useNavigate();

  // ── Step state ──────────────────────────────────────────────────
  const [step, setStep] = createSignal(0);

  // ── Form state ──────────────────────────────────────────────────
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [repoUrl, setRepoUrl] = createSignal("");
  const [framework, setFramework] = createSignal("");
  const [buildCommand, setBuildCommand] = createSignal("");
  const [runtime, setRuntime] = createSignal("");
  const [port, setPort] = createSignal("");
  const [customDomain, setCustomDomain] = createSignal("");

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

      <div class="min-h-screen bg-[#060606]">
        <div class="mx-auto max-w-2xl px-6 py-8 lg:px-8">
          {/* ── Breadcrumb ──────────────────────────────────────── */}
          <div class="mb-6 flex items-center gap-2 text-xs text-gray-500">
            <A
              href="/projects"
              class="transition-colors hover:text-gray-300"
            >
              Projects
            </A>
            <span>/</span>
            <span class="text-gray-300">New</span>
          </div>

          {/* ── Header ──────────────────────────────────────────── */}
          <div class="mb-8">
            <h1 class="text-2xl font-bold tracking-tight text-white">
              Create a new project
            </h1>
            <p class="mt-1 text-sm text-gray-500">
              Configure and deploy to the Crontech edge network.
            </p>
          </div>

          {/* ── Step Indicator ───────────────────────────────────── */}
          <div class="mb-8">
            <StepIndicator currentStep={step()} />
          </div>

          {/* ── Step Content ─────────────────────────────────────── */}
          <div
            class="rounded-2xl border border-white/[0.06] p-6"
            style={{
              background:
                "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
            }}
          >
            {/* Step 0: Basics */}
            <Show when={step() === 0}>
              <div class="flex flex-col gap-5">
                <h2 class="text-lg font-semibold text-white">
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
                  <label class="input-label">Description (optional)</label>
                  <textarea
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
                <h2 class="text-lg font-semibold text-white">
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
                <h2 class="text-lg font-semibold text-white">
                  Custom domain
                </h2>
                <p class="text-sm text-gray-500">
                  You can add a custom domain now or later from project settings.
                  A <span class="font-mono text-cyan-400">.crontech.app</span> subdomain
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
              <div class="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {friendlyError(createProject.error())}
              </div>
            </Show>

            {/* ── Navigation buttons ─────────────────────────────── */}
            <div class="mt-8 flex items-center justify-between">
              <Show
                when={step() > 0}
                fallback={
                  <A href="/projects">
                    <Button variant="ghost" size="md">
                      Cancel
                    </Button>
                  </A>
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
        </div>
      </div>
    </ProtectedRoute>
  );
}
