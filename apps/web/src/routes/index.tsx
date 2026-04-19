import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Data ────────────────────────────────────────────────────────────

interface Problem {
  icon: IconName;
  title: string;
  description: string;
}

const problems: Problem[] = [
  {
    icon: "settings",
    title: "The DIY compliance stack",
    description:
      "GitHub Actions for CI. A separate SAST scanner. Evidence scraped out of logs. A Notion page that someone swears is the real control matrix. Nothing agrees with anything else at audit time.",
  },
  {
    icon: "file-text",
    title: "Manual audit evidence",
    description:
      "Screenshots, CSVs, Slack threads pasted into a shared drive. Every SOC 2 Type II window is a scramble to reconstruct what actually happened in CI six months ago.",
  },
  {
    icon: "eye-off",
    title: "Vanta and Drata abstract the wrong layer",
    description:
      "They paper over the pipeline instead of owning it. The controls get reported green while the CI that enforces them is held together with bash and hope. Auditors are starting to notice.",
  },
];

interface Solution {
  icon: IconName;
  title: string;
  description: string;
  badge?: string;
}

const solutions: Solution[] = [
  {
    icon: "zap",
    title: "Every run produces audit artifacts",
    description:
      "Build, scan, SBOM, test results, deploy signatures — emitted as structured evidence on every CI run. No separate evidence pipeline, no scraping, no end-of-quarter panic. The artifact IS the control.",
    badge: "Automatic",
  },
  {
    icon: "lock",
    title: "Hash-chained audit log",
    description:
      "Every event is SHA-256 hashed and chained to the previous entry. Retroactive tampering is mathematically detectable. SOC 2-grade tamper evidence — the same pattern auditors use on financial systems.",
    badge: "SOC 2-grade",
  },
  {
    icon: "server",
    title: "Self-hostable from day one",
    description:
      "Run Crontech in your own VPC when the customer demands it. One docker-compose for the control plane, one for the runners. Same binary we run in production. No feature split between cloud and self-hosted.",
    badge: "Open core",
  },
];

interface Step {
  number: string;
  title: string;
  description: string;
  icon: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Push",
    description:
      "Connect a repo. Crontech picks up every push and PR. No YAML archaeology — opinionated defaults that map to real SOC 2 controls out of the box.",
    icon: "\u{2B06}",
  },
  {
    number: "02",
    title: "Scan + Build + Audit",
    description:
      "Pipeline runs SAST, SCA, SBOM generation, build, and tests in parallel. Each step writes a signed, hash-chained audit entry. Evidence is produced as a side-effect of shipping.",
    icon: "\u{1F50D}",
  },
  {
    number: "03",
    title: "Deploy with an evidence trail",
    description:
      "The deploy artifact is bundled with its complete audit chain. Pull any release, get a cryptographically-verifiable record of what was scanned, who approved it, and when it shipped.",
    icon: "\u{1F680}",
  },
];

interface Signal {
  value: string;
  label: string;
}

const signals: Signal[] = [
  { value: "SOC 2 Type II", label: "Control set from day one" },
  { value: "Hash-chained", label: "Tamper-evident audit log" },
  { value: "Self-hostable", label: "Your VPC or ours" },
  { value: "Open core", label: "@crontech/audit-log is MIT" },
];

// ── Problem Card ────────────────────────────────────────────────────

function ProblemCard(props: Problem): JSX.Element {
  return (
    <div class="landing-card h-full p-7">
      <div class="flex h-full flex-col gap-5">
        <div
          class="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.12))",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <Icon name={props.icon} size={20} />
        </div>

        <div class="flex flex-col gap-2.5">
          <h3
            class="text-[1.0625rem] font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            {props.title}
          </h3>
          <p
            class="text-[0.875rem] leading-[1.75]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {props.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Solution Card ───────────────────────────────────────────────────

function SolutionCard(props: Solution): JSX.Element {
  return (
    <div class="landing-card h-full p-7">
      <div class="flex h-full flex-col gap-5">
        <div class="flex items-start justify-between gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
              color: "#a5b4fc",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <Icon name={props.icon} size={20} />
          </div>
          <Show when={props.badge}>
            <span
              class="shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgba(99,102,241,0.12)",
                color: "#a5b4fc",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              {props.badge}
            </span>
          </Show>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3
            class="text-[1.0625rem] font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            {props.title}
          </h3>
          <p
            class="text-[0.875rem] leading-[1.75]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {props.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step Card ───────────────────────────────────────────────────────

function StepCard(props: Step & { isLast: boolean }): JSX.Element {
  return (
    <div class="relative flex flex-col items-center gap-6 text-center">
      <div class="relative">
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            "box-shadow": "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {props.icon}
        </div>
        <div
          class="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            "box-shadow": "0 2px 6px rgba(99,102,241,0.4)",
          }}
        >
          {props.number}
        </div>
      </div>

      <h3
        class="text-lg font-semibold tracking-tight"
        style={{ color: "#0f172a" }}
      >
        {props.title}
      </h3>
      <p
        class="max-w-[280px] text-[0.875rem] leading-[1.75]"
        style={{ color: "#64748b" }}
      >
        {props.description}
      </p>

      <Show when={!props.isLast}>
        <div class="landing-step-connector" />
      </Show>
    </div>
  );
}

// ── Signal Block ────────────────────────────────────────────────────

function SignalBlock(props: Signal): JSX.Element {
  return (
    <div class="landing-stat-block">
      <span class="landing-stat-value">{props.value}</span>
      <span class="landing-stat-label">{props.label}</span>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title={"Crontech \u2014 Compliance-native CI/CD for AI SaaS"}
        description="CI/CD that produces audit evidence automatically. Hash-chained logs, SOC 2-ready from day one, self-hostable."
        path="/"
      />

      <div>
        {/* ── Hero (dark) ──────────────────────────────────────── */}
        <section class="landing-hero">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-40 pb-44 lg:px-8 lg:pt-52 lg:pb-56">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div class="landing-hero-badge mb-10">
                <span class="landing-hero-badge-dot" aria-hidden="true" />
                <span class="landing-hero-badge-text">Now in early access &mdash; built for SOC 2 Type II</span>
              </div>

              {/* Headline */}
              <h1
                class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.25rem]"
                style={{ color: "#0f172a" }}
              >
                The CI/CD{" "}
                <span class="landing-gradient-text">
                  that audits itself.
                </span>
              </h1>

              {/* Subheading */}
              <p
                class="mt-7 max-w-2xl text-[1.0625rem] leading-[1.8] sm:text-lg"
                style={{ color: "#475569" }}
              >
                Compliance-native CI/CD for AI SaaS companies. Every build emits
                signed, hash-chained audit evidence &mdash; the same artifacts
                your SOC 2 auditor will ask for, produced automatically, on
                every run.
              </p>

              {/* CTAs */}
              <div class="mt-14 flex flex-col items-center gap-5 sm:flex-row">
                <A href="/register">
                  <button class="landing-hero-btn-primary" type="button">
                    Start a free project &#8594;
                  </button>
                </A>
                <A href="/dashboard">
                  <button class="landing-hero-btn-outline" type="button">
                    See the audit log demo
                  </button>
                </A>
              </div>

              {/* Proof strip */}
              <div class="landing-tech-strip-wrap mt-28">
                <div class="landing-tech-strip-divider" aria-hidden="true" />
                <div class="landing-tech-strip">
                  <For
                    each={[
                      "Built for SOC 2 Type II from day one",
                      "Hash-chained audit log",
                      "SBOM on every build",
                      "Self-hostable in your VPC",
                      "Open-core audit engine",
                    ]}
                  >
                    {(signal) => (
                      <span class="landing-tech-strip-item">{signal}</span>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Signals strip (dark-to-light transition) ────────────── */}
        <section class="landing-stats-section">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="grid grid-cols-2 sm:grid-cols-4">
              <For each={signals}>
                {(signal, i) => (
                  <div
                    style={{
                      "border-right": i() < signals.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <SignalBlock value={signal.value} label={signal.label} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── The Problem ───────────────────────────────────────── */}
        <section class="landing-dark-section py-32 lg:py-44">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#fca5a5" }}
                />
                The problem
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#0f172a" }}
              >
                Compliance is a second pipeline you build by hand
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                Seed-to-Series-A SaaS teams hit SOC 2 and discover the tooling
                market has two bad options: roll your own, or paper it over
                with a dashboard that doesn&apos;t touch the pipeline.
              </p>
            </div>

            <div class="landing-feature-grid grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
              <For each={problems}>
                {(problem) => (
                  <ProblemCard
                    icon={problem.icon}
                    title={problem.title}
                    description={problem.description}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── The Solution ──────────────────────────────────────── */}
        <section class="landing-dark-section-alt py-32 lg:py-44">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
                The solution
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#f0f0f5" }}
              >
                A CI/CD that treats evidence as a first-class output
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Stop stitching CI, SAST, SBOM, and evidence collection
                together. One pipeline emits all of it, cryptographically
                bound, ready for the auditor who hasn&apos;t knocked yet.
              </p>
            </div>

            <div class="landing-feature-grid grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
              <For each={solutions}>
                {(solution) => (
                  <SolutionCard
                    icon={solution.icon}
                    title={solution.title}
                    description={solution.description}
                    badge={solution.badge}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section class="landing-dark-section py-32 lg:py-44">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
                How it works
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#0f172a" }}
              >
                Push, scan, ship &mdash; with a signed trail behind every release
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                Three steps. No second pipeline. No evidence-gathering sprint
                at audit time.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-14 sm:grid-cols-3 sm:gap-8">
              <For each={steps}>
                {(step, i) => (
                  <StepCard
                    number={step.number}
                    title={step.title}
                    description={step.description}
                    icon={step.icon}
                    isLast={i() === steps.length - 1}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Social proof / signals ─────────────────────────────── */}
        <section class="landing-dark-section-alt py-32 lg:py-44">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div class="landing-card relative overflow-hidden p-8">
                <div
                  class="absolute top-0 left-0 right-0 h-[2px]"
                  style={{
                    background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)",
                  }}
                />
                <span
                  class="mb-5 inline-block text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#818cf8" }}
                >
                  We run on our own stack
                </span>
                <h3
                  class="mb-3 text-xl font-bold tracking-tight"
                  style={{ color: "#f0f0f5" }}
                >
                  Crontech ships Crontech
                </h3>
                <p
                  class="text-[0.875rem] leading-[1.75]"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  Every release of the platform is built, scanned, and deployed
                  by the pipeline we&apos;re selling you &mdash; self-hosted,
                  on our own infrastructure. The audit log for our own product
                  is the same audit log you&apos;ll get.
                </p>
              </div>

              <div class="landing-card relative overflow-hidden p-8">
                <div
                  class="absolute top-0 left-0 right-0 h-[2px]"
                  style={{
                    background: "linear-gradient(90deg, #10b981, #06b6d4, #6366f1)",
                  }}
                />
                <span
                  class="mb-5 inline-block text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#34d399" }}
                >
                  Open-core audit engine
                </span>
                <h3
                  class="mb-3 text-xl font-bold tracking-tight"
                  style={{ color: "#f0f0f5" }}
                >
                  @crontech/audit-log is MIT-licensed
                </h3>
                <p
                  class="text-[0.875rem] leading-[1.75]"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  The hash-chaining engine that backs every audit claim we make
                  is open source. Read the code, run it standalone, verify our
                  chains against the public algorithm. No black box between
                  your pipeline and your auditor.
                </p>
              </div>
            </div>

            {/* Pricing teaser */}
            <div class="mt-16 flex flex-col items-center text-center">
              <p
                class="text-[0.95rem]"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Free for your first project. Usage-based after that.
              </p>
              <A
                href="/pricing"
                class="mt-3 text-sm font-medium"
                style={{ color: "#818cf8" }}
              >
                See pricing &#8594;
              </A>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA (dark) ─────────────────────────────────── */}
        <section class="landing-cta-section">
          <div class="relative z-10 mx-auto max-w-[800px] px-6 py-40 text-center lg:px-8 lg:py-52">
            <h2
              class="text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem] lg:text-[2.75rem]"
              style={{ color: "#0f172a" }}
            >
              Ship with the audit trail{" "}
              <span class="landing-gradient-text">
                already in the box.
              </span>
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "#64748b" }}
            >
              Connect a repo, push a commit, and watch evidence get produced on
              the same pipeline that ships your code. SOC 2 stops being a
              second project.
            </p>
            <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/register">
                <button class="landing-hero-btn-primary" type="button">
                  Start in 5 minutes &#8594;
                </button>
              </A>
              <Show
                when={auth.isAuthenticated()}
                fallback={
                  <A href="/support">
                    <button class="landing-hero-btn-outline" type="button">
                      Book a demo
                    </button>
                  </A>
                }
              >
                <A href="/dashboard">
                  <button class="landing-hero-btn-outline" type="button">
                    Open dashboard
                  </button>
                </A>
              </Show>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
