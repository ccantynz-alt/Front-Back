import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { A } from "@solidjs/router";

// ── Shared docs article shell ───────────────────────────────────────
// Used by every /docs/getting-started/* article. Keeps the styling,
// typographic rhythm, and "Next steps" card consistent so articles
// can focus on content and not re-derive visual grammar each time.

export interface NextStep {
  label: string;
  href: string;
  description: string;
}

export interface DocsArticleProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  readTime: string;
  updated: string;
  nextStep?: NextStep;
  children: JSX.Element;
}

export function DocsArticle(props: DocsArticleProps): JSX.Element {
  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <article class="mx-auto max-w-3xl px-6 pt-16 pb-24">
        {/* ── Breadcrumb ──────────────────────────────────────────── */}
        <nav
          class="mb-6 flex items-center gap-2 text-xs"
          style={{ color: "var(--color-text-faint)" }}
          aria-label="Breadcrumb"
        >
          <A
            href="/docs"
            style={{ color: "var(--color-text-muted)", "text-decoration": "none" }}
          >
            Docs
          </A>
          <span>/</span>
          <A
            href="/docs#getting-started"
            style={{ color: "var(--color-text-muted)", "text-decoration": "none" }}
          >
            Getting Started
          </A>
          <span>/</span>
          <span style={{ color: "var(--color-text)" }}>{props.eyebrow}</span>
        </nav>

        {/* ── Header ─────────────────────────────────────────────── */}
        <header class="mb-10">
          <p
            class="mb-2 text-xs font-mono uppercase tracking-wider"
            style={{ color: "var(--color-primary)" }}
          >
            {props.eyebrow}
          </p>
          <h1
            class="text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: "var(--color-text)", "line-height": "1.1" }}
          >
            {props.title}
          </h1>
          <p
            class="mt-4 text-lg"
            style={{ color: "var(--color-text-muted)", "line-height": "1.6" }}
          >
            {props.subtitle}
          </p>
          <div
            class="mt-5 flex items-center gap-4 text-xs"
            style={{ color: "var(--color-text-faint)" }}
          >
            <span>{props.readTime} read</span>
            <span>·</span>
            <span>Updated {props.updated}</span>
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div class="docs-prose" style={{ color: "var(--color-text-secondary)" }}>
          {props.children}
        </div>

        {/* ── Next steps ─────────────────────────────────────────── */}
        <Show when={props.nextStep}>
          {(step) => (
            <A
              href={step().href}
              class="mt-16 block rounded-2xl border border-[var(--color-border)] p-6 transition-all duration-200 hover:border-[var(--color-border-strong)]"
              style={{
                background: "var(--color-bg-subtle)",
                "text-decoration": "none",
              }}
            >
              <span
                class="block text-xs font-mono uppercase tracking-wider mb-2"
                style={{ color: "var(--color-text-faint)" }}
              >
                Next steps
              </span>
              <span
                class="block text-lg font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {step().label} →
              </span>
              <span
                class="mt-1 block text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {step().description}
              </span>
            </A>
          )}
        </Show>
      </article>
    </div>
  );
}

// ── Inline helper elements used by articles ─────────────────────────

export function Steps(props: { children: JSX.Element }): JSX.Element {
  return (
    <ol
      class="docs-steps my-6 space-y-4 pl-6 list-decimal"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {props.children}
    </ol>
  );
}

export function Callout(props: {
  tone?: "info" | "warn" | "note";
  title?: string;
  children: JSX.Element;
}): JSX.Element {
  const tone = (): "info" | "warn" | "note" => props.tone ?? "info";
  const border = (): string =>
    tone() === "warn"
      ? "var(--color-warning)"
      : tone() === "note"
        ? "var(--color-border-strong)"
        : "var(--color-primary)";
  return (
    <aside
      class="my-6 rounded-xl border p-4"
      style={{
        "border-color": border(),
        background: "var(--color-bg-subtle)",
        color: "var(--color-text-secondary)",
      }}
    >
      <Show when={props.title}>
        <p
          class="mb-1 text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {props.title}
        </p>
      </Show>
      <div class="text-sm" style={{ "line-height": "1.6" }}>
        {props.children}
      </div>
    </aside>
  );
}

export function ScreenshotSlot(props: { caption: string }): JSX.Element {
  // Placeholder block — Craig will drop a real screenshot in here later.
  // The caption doubles as a description of what the image should show.
  return (
    <figure
      class="my-6 rounded-xl border border-dashed p-6 text-center"
      style={{
        "border-color": "var(--color-border)",
        background: "var(--color-bg-subtle)",
      }}
    >
      <div
        class="text-xs font-mono uppercase tracking-wider mb-2"
        style={{ color: "var(--color-text-faint)" }}
      >
        TODO: screenshot
      </div>
      <figcaption
        class="text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {props.caption}
      </figcaption>
    </figure>
  );
}

export function KeyList(props: {
  items: ReadonlyArray<{ term: string; description: string }>;
}): JSX.Element {
  return (
    <dl class="my-6 space-y-3">
      <For each={props.items}>
        {(item) => (
          <div
            class="rounded-lg border border-[var(--color-border)] p-4"
            style={{ background: "var(--color-bg-subtle)" }}
          >
            <dt
              class="text-sm font-semibold font-mono"
              style={{ color: "var(--color-text)" }}
            >
              {item.term}
            </dt>
            <dd
              class="mt-1 text-sm"
              style={{ color: "var(--color-text-muted)", "line-height": "1.6" }}
            >
              {item.description}
            </dd>
          </div>
        )}
      </For>
    </dl>
  );
}
