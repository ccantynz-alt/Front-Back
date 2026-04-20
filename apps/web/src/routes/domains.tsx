// ── BLK-025 Domain Search: Public Search UI ──────────────────────────
//
// Customer-facing domain search. Real-time availability across the top
// TLDs, trademark warnings flagged inline, AI-generated brandable
// alternatives below. Only available names are shown.
//
// Polite copy only — we never name other domain search tools in public
// copy, even though the problem we solve is that most of them mix
// taken + available domains together.

import {
  createResource,
  createSignal,
  For,
  Show,
  type JSX,
} from "solid-js";
import { A } from "@solidjs/router";
import { Badge, Button } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";
import { trpc } from "../lib/trpc";

// ── Types mirrored from the API (kept narrow to avoid circular types) ──

interface DomainResult {
  readonly domain: string;
  readonly tld: string;
  readonly available: boolean;
  readonly unknown: boolean;
  readonly reason: string;
  readonly lookupMs: number;
}

interface AiAlternative {
  readonly domain: string;
  readonly reasoning: string;
  readonly brandability: number;
}

interface TrademarkConflict {
  readonly mark: string;
  readonly owner: string;
  readonly class?: string | undefined;
  readonly similarity: number;
  readonly risk: "low" | "medium" | "high";
  readonly citation: string;
}

interface SearchResponse {
  readonly query: string;
  readonly label: string | null;
  readonly available: ReadonlyArray<DomainResult>;
  readonly takenCount: number;
  readonly unknownCount: number;
  readonly suggestions?: ReadonlyArray<AiAlternative> | undefined;
  readonly suggestionsNote?: string | undefined;
  readonly trademarkWarnings?: ReadonlyArray<TrademarkConflict> | undefined;
  readonly trademarkNote?: string | undefined;
  readonly cached: boolean;
  readonly tldsChecked: ReadonlyArray<string>;
}

// ── Helpers ───────────────────────────────────────────────────────────

export function riskBadgeTone(risk: TrademarkConflict["risk"]): {
  label: string;
  color: string;
  bg: string;
} {
  switch (risk) {
    case "high":
      return {
        label: "High risk",
        color: "var(--color-danger-text)",
        bg: "var(--color-danger-bg)",
      };
    case "medium":
      return {
        label: "Medium risk",
        color: "var(--color-warning)",
        bg: "var(--color-warning-bg)",
      };
    default:
      return {
        label: "Low risk",
        color: "var(--color-text-muted)",
        bg: "var(--color-bg-subtle)",
      };
  }
}

export function brandabilityTone(score: number): string {
  if (score >= 8.5) return "var(--color-success)";
  if (score >= 6.5) return "var(--color-primary)";
  if (score >= 4) return "var(--color-warning)";
  return "var(--color-text-faint)";
}

// ── Data loader ───────────────────────────────────────────────────────

interface SearchParams {
  readonly query: string;
  readonly tlds: ReadonlyArray<string>;
  readonly includeTrademark: boolean;
  readonly includeAiSuggestions: boolean;
}

async function loadSearch(params: SearchParams): Promise<SearchResponse> {
  if (params.query.trim().length === 0) {
    return {
      query: "",
      label: null,
      available: [],
      takenCount: 0,
      unknownCount: 0,
      cached: false,
      tldsChecked: params.tlds,
    };
  }
  return (await trpc.domainSearch.search.query({
    query: params.query,
    tlds: [...params.tlds],
    includeTrademark: params.includeTrademark,
    includeAiSuggestions: params.includeAiSuggestions,
  })) as SearchResponse;
}

// ── Page ──────────────────────────────────────────────────────────────

const POPULAR_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "ai",
  "dev",
  "app",
  "co",
  "xyz",
  "tech",
  "cloud",
] as const;

export default function DomainsPage(): JSX.Element {
  const [query, setQuery] = createSignal("");
  const [submitted, setSubmitted] = createSignal<string>("");
  const [selectedTlds, setSelectedTlds] = createSignal<ReadonlyArray<string>>(
    POPULAR_TLDS,
  );
  const [includeTrademark, setIncludeTrademark] = createSignal(true);
  const [includeAi, setIncludeAi] = createSignal(true);

  const [results] = createResource(
    () => ({
      query: submitted(),
      tlds: selectedTlds(),
      includeTrademark: includeTrademark(),
      includeAiSuggestions: includeAi(),
    }),
    loadSearch,
  );

  function onSubmit(ev: SubmitEvent): void {
    ev.preventDefault();
    setSubmitted(query().trim());
  }

  function toggleTld(tld: string): void {
    const current = selectedTlds();
    const next = current.includes(tld)
      ? current.filter((t) => t !== tld)
      : [...current, tld];
    setSelectedTlds(next.length === 0 ? POPULAR_TLDS : next);
  }

  return (
    <>
      <SEOHead
        title="Find your next domain — Crontech"
        description="Real-time availability across the top 20 TLDs. Only available names. AI-generated alternatives. Trademark risk flagged."
        path="/domains"
      />

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {/* Hero + search */}
        <section class="mx-auto max-w-4xl px-6 pt-20 pb-10">
          <h1
            class="text-center text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: "var(--color-text)" }}
          >
            Find your next domain
          </h1>
          <p
            class="mt-4 text-center text-base sm:text-lg"
            style={{ color: "var(--color-text-muted)" }}
          >
            Real-time availability across the top 20 TLDs. Only available names.
            AI-generated alternatives. Trademark risk flagged.
          </p>

          <form class="mt-10" onSubmit={onSubmit}>
            <label
              for="domain-search-input"
              class="sr-only"
            >
              Search for a domain
            </label>
            <div
              class="flex items-stretch gap-2 rounded-2xl p-2"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <input
                id="domain-search-input"
                name="query"
                type="text"
                autocomplete="off"
                autocapitalize="none"
                spellcheck={false}
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                placeholder="e.g. fable, my-app, nebula"
                class="w-full bg-transparent px-4 py-3 text-base outline-none"
                style={{ color: "var(--color-text)" }}
              />
              <Button type="submit" variant="primary">
                Search
              </Button>
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
              <For each={POPULAR_TLDS}>
                {(tld) => {
                  const active = (): boolean => selectedTlds().includes(tld);
                  return (
                    <button
                      type="button"
                      onClick={() => toggleTld(tld)}
                      class="rounded-full px-3 py-1 text-xs font-medium transition"
                      style={{
                        background: active()
                          ? "var(--color-primary)"
                          : "var(--color-bg-subtle)",
                        color: active()
                          ? "var(--color-primary-fg)"
                          : "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      .{tld}
                    </button>
                  );
                }}
              </For>
            </div>
            <div
              class="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeAi()}
                  onChange={(e) => setIncludeAi(e.currentTarget.checked)}
                />
                AI-generated alternatives
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeTrademark()}
                  onChange={(e) =>
                    setIncludeTrademark(e.currentTarget.checked)
                  }
                />
                Trademark risk check
              </label>
            </div>
          </form>
        </section>

        {/* Results */}
        <section class="mx-auto max-w-4xl px-6 pb-20">
          <Show when={submitted().length > 0}>
            <Show
              when={!results.loading}
              fallback={
                <div
                  class="rounded-2xl p-10 text-center"
                  style={{
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Searching the top TLDs…
                </div>
              }
            >
              {(() => {
                const data = results();
                if (!data) return null;
                return (
                  <>
                    {/* Trademark warnings */}
                    <Show
                      when={
                        data.trademarkWarnings !== undefined &&
                        data.trademarkWarnings.length > 0
                      }
                    >
                      <div
                        class="mb-6 rounded-2xl p-5"
                        style={{
                          border: "1px solid var(--color-warning)",
                          background: "var(--color-warning-bg)",
                        }}
                      >
                        <div class="flex items-center gap-2">
                          <span
                            class="text-sm font-semibold"
                            style={{ color: "var(--color-warning)" }}
                          >
                            Trademark pre-screen
                          </span>
                          <Badge variant="warning">
                            {data.trademarkWarnings?.length ?? 0} flagged
                          </Badge>
                        </div>
                        <p
                          class="mt-2 text-xs"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          This is an informational pre-screen, not legal advice.
                          Consult counsel before filing.
                        </p>
                        <div class="mt-4 space-y-3">
                          <For each={data.trademarkWarnings}>
                            {(w) => {
                              const tone = riskBadgeTone(w.risk);
                              return (
                                <div
                                  class="rounded-xl p-3"
                                  style={{
                                    background: "var(--color-bg-elevated)",
                                    border: "1px solid var(--color-border)",
                                  }}
                                >
                                  <div class="flex items-center justify-between gap-3">
                                    <span
                                      class="text-sm font-semibold"
                                      style={{ color: "var(--color-text)" }}
                                    >
                                      {w.mark}
                                    </span>
                                    <span
                                      class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                      style={{
                                        background: tone.bg,
                                        color: tone.color,
                                      }}
                                    >
                                      {tone.label}
                                    </span>
                                  </div>
                                  <p
                                    class="mt-1 text-xs"
                                    style={{ color: "var(--color-text-muted)" }}
                                  >
                                    Owner: {w.owner}
                                    <Show when={w.class}>
                                      {" · "}
                                      {w.class}
                                    </Show>
                                    {" · Similarity "}
                                    {(w.similarity * 100).toFixed(0)}%
                                  </p>
                                  <p
                                    class="mt-2 text-xs"
                                    style={{
                                      color: "var(--color-text-secondary)",
                                    }}
                                  >
                                    {w.citation}
                                  </p>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Available domains */}
                    <div class="mb-8">
                      <div class="mb-3 flex items-center justify-between">
                        <h2
                          class="text-lg font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          Available ({data.available.length})
                        </h2>
                        <span
                          class="text-xs"
                          style={{ color: "var(--color-text-faint)" }}
                        >
                          Checked {data.tldsChecked.length} TLDs ·{" "}
                          {data.takenCount} taken · {data.unknownCount} unknown
                        </span>
                      </div>
                      <Show
                        when={data.available.length > 0}
                        fallback={
                          <div
                            class="rounded-2xl p-10 text-center"
                            style={{
                              border: "1px dashed var(--color-border)",
                              background: "var(--color-bg-subtle)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            No available names on the selected TLDs. Try
                            toggling more extensions above or see the
                            suggestions below.
                          </div>
                        }
                      >
                        <div
                          class="overflow-hidden rounded-2xl"
                          style={{
                            border: "1px solid var(--color-border)",
                            background: "var(--color-bg-elevated)",
                          }}
                        >
                          <For each={data.available}>
                            {(r, idx) => (
                              <div
                                class="flex items-center justify-between gap-4 px-5 py-4"
                                style={{
                                  "border-bottom":
                                    idx() < data.available.length - 1
                                      ? "1px solid var(--color-border)"
                                      : "none",
                                }}
                              >
                                <div class="min-w-0 flex-1">
                                  <div class="flex items-center gap-2">
                                    <span
                                      class="font-mono text-base font-medium"
                                      style={{ color: "var(--color-text)" }}
                                    >
                                      {r.domain}
                                    </span>
                                    <Badge variant="success">Available</Badge>
                                  </div>
                                  <p
                                    class="mt-1 text-xs"
                                    style={{ color: "var(--color-text-faint)" }}
                                  >
                                    {r.reason} · {r.lookupMs}ms
                                  </p>
                                </div>
                                <A
                                  href={`/domains?register=${encodeURIComponent(r.domain)}`}
                                  aria-label={`Register ${r.domain}`}
                                  class="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition"
                                  style={{
                                    background: "var(--color-primary)",
                                    color: "var(--color-primary-fg)",
                                  }}
                                >
                                  Register
                                </A>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>

                    {/* AI suggestions */}
                    <Show
                      when={
                        data.suggestions !== undefined &&
                        data.suggestions.length > 0
                      }
                    >
                      <div class="mb-8">
                        <h2
                          class="mb-3 text-lg font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          AI brandable alternatives
                        </h2>
                        <div class="grid gap-3 sm:grid-cols-2">
                          <For each={data.suggestions}>
                            {(s) => (
                              <div
                                class="rounded-2xl p-4"
                                style={{
                                  border: "1px solid var(--color-border)",
                                  background: "var(--color-bg-elevated)",
                                }}
                              >
                                <div class="flex items-center justify-between gap-3">
                                  <span
                                    class="font-mono text-base font-medium"
                                    style={{ color: "var(--color-text)" }}
                                  >
                                    {s.domain}
                                  </span>
                                  <span
                                    class="text-xs font-semibold"
                                    style={{
                                      color: brandabilityTone(s.brandability),
                                    }}
                                  >
                                    {s.brandability.toFixed(1)} / 10
                                  </span>
                                </div>
                                <p
                                  class="mt-2 text-xs"
                                  style={{
                                    color: "var(--color-text-secondary)",
                                  }}
                                >
                                  {s.reasoning}
                                </p>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show
                      when={
                        data.suggestions !== undefined &&
                        data.suggestions.length === 0 &&
                        data.suggestionsNote
                      }
                    >
                      <p
                        class="mt-2 text-center text-xs"
                        style={{ color: "var(--color-text-faint)" }}
                      >
                        {data.suggestionsNote}
                      </p>
                    </Show>
                  </>
                );
              })()}
            </Show>
          </Show>

          <Show when={submitted().length === 0}>
            <div
              class="rounded-2xl p-10 text-center"
              style={{
                border: "1px dashed var(--color-border)",
                background: "var(--color-bg-subtle)",
                color: "var(--color-text-muted)",
              }}
            >
              Start typing a name above. We'll check every popular TLD in
              parallel and only show you names that are actually free to
              register.
            </div>
          </Show>
        </section>
      </div>
    </>
  );
}
