// ── BLK-029 eSIM Reseller: Public Plan Browser ───────────────────────
//
// Customer-facing eSIM data-plan page. Country picker + plan grid + a
// "Buy" button that deep-links into the checkout flow. Pricing shows
// retail (markup already baked in by the API).
//
// Polite copy only — the customer sees "Crontech eSIM". No wholesaler
// name appears in public copy. Tone rules: helpful, reassuring, concise.

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

// ── Types mirrored from the API (kept narrow to dodge circular types) ──

interface PackageView {
  readonly id: string;
  readonly title: string;
  readonly operatorTitle: string;
  readonly countryCode: string | null;
  readonly dataGb: number;
  readonly validityDays: number;
  readonly isUnlimited: boolean;
  readonly type: string;
  readonly wholesaleMicrodollars: number;
  readonly retailMicrodollars: number;
  readonly markupMicrodollars: number;
  readonly markupPercent: number;
  readonly currency: "USD";
}

interface ListPackagesResponse {
  readonly packages: ReadonlyArray<PackageView>;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Format microdollars as a friendly USD price string (e.g. "$5.63"). */
export function formatRetail(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}

/** Badge tone for the region classifier (global vs local). */
export function regionBadgeTone(type: string): {
  label: string;
  color: string;
  bg: string;
} {
  if (type.toLowerCase() === "global") {
    return {
      label: "Global",
      color: "var(--color-primary)",
      bg: "var(--color-bg-subtle)",
    };
  }
  return {
    label: "Local",
    color: "var(--color-text-muted)",
    bg: "var(--color-bg-subtle)",
  };
}

/** Describe the data bucket — handles unlimited + sub-1GB plans politely. */
export function formatDataLabel(
  dataGb: number,
  isUnlimited: boolean,
): string {
  if (isUnlimited) return "Unlimited data";
  if (dataGb >= 1) {
    const rounded = dataGb % 1 === 0 ? dataGb.toFixed(0) : dataGb.toFixed(1);
    return `${rounded} GB`;
  }
  const mb = Math.round(dataGb * 1024);
  return `${mb} MB`;
}

// ── Data loader ───────────────────────────────────────────────────────

interface LoadParams {
  readonly countryCode: string;
  readonly region: "global" | "local" | "";
  readonly minDataGb: number;
}

async function loadPackages(
  params: LoadParams,
): Promise<ListPackagesResponse> {
  const input: {
    countryCode?: string;
    region?: "global" | "local";
    dataGb?: number;
  } = {};
  if (params.countryCode.length === 2) {
    input.countryCode = params.countryCode.toUpperCase();
  }
  if (params.region !== "") input.region = params.region;
  if (params.minDataGb > 0) input.dataGb = params.minDataGb;
  return (await trpc.esim.listPackages.query(input)) as ListPackagesResponse;
}

// ── Popular destinations ──────────────────────────────────────────────
// A starter pick-list of the biggest roaming destinations. Customers can
// still type any ISO country code manually. We keep this list short to
// dodge sprawl — real country pickers can come later once traffic shows
// what customers actually ask for.

const POPULAR_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "DE", name: "Germany" },
  { code: "JP", name: "Japan" },
  { code: "TH", name: "Thailand" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
];

// ── Page ──────────────────────────────────────────────────────────────

export default function EsimPage(): JSX.Element {
  const [countryCode, setCountryCode] = createSignal<string>("");
  const [region, setRegion] = createSignal<"global" | "local" | "">("");
  const [minDataGb, setMinDataGb] = createSignal<number>(0);

  const [results] = createResource(
    () => ({
      countryCode: countryCode(),
      region: region(),
      minDataGb: minDataGb(),
    }),
    loadPackages,
  );

  function onSelectCountry(code: string): void {
    setCountryCode((current) => (current === code ? "" : code));
  }

  return (
    <>
      <SEOHead
        title="Travel eSIM data plans — Crontech"
        description="Buy a data plan for your next trip in under a minute. Install instantly with a QR code, no physical SIM swap, polite 24/7 support."
        path="/esim"
      />

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {/* ── Coming Soon banner ────────────────────────────────
            Public launch is pending the upstream eSIM partner's
            activation step (BLK-029). The wholesaler is never named
            in public copy per the anonymity rule at the top of this
            file — and the same rule holds in code comments, so
            downstream tests can keep grepping the whole source. The
            plan browser still renders so trusted beta testers can
            preview the catalog. */}
        <section class="mx-auto max-w-4xl px-6 pt-6">
          <div
            role="status"
            aria-live="polite"
            class="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "var(--color-bg-subtle)",
              border: "1px dashed var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            <span
              class="inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: "#fbbf24" }}
                aria-hidden="true"
              />
              Coming soon
            </span>
            <span>
              Public launch is pending partner activation — plans shown here
              are a preview, checkout opens the moment we're live.
            </span>
          </div>
        </section>

        {/* Hero */}
        <section class="mx-auto max-w-4xl px-6 pt-10 pb-10">
          <h1
            class="text-center text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ color: "var(--color-text)" }}
          >
            Stay connected anywhere
          </h1>
          <p
            class="mt-4 text-center text-base sm:text-lg"
            style={{ color: "var(--color-text-muted)" }}
          >
            Travel eSIM data plans for 200+ countries. Install instantly with
            a QR code — no physical SIM swap, no roaming bill surprises.
          </p>

          {/* Country picker */}
          <div class="mt-10">
            <label
              for="esim-country-input"
              class="sr-only"
            >
              Select a country
            </label>
            <div class="mb-3 flex flex-wrap items-center justify-center gap-2">
              <For each={POPULAR_COUNTRIES}>
                {(c) => {
                  const active = (): boolean => countryCode() === c.code;
                  return (
                    <button
                      type="button"
                      onClick={() => onSelectCountry(c.code)}
                      aria-label={`Browse eSIM plans for ${c.name}`}
                      aria-pressed={active()}
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
                      {c.name}
                    </button>
                  );
                }}
              </For>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-3">
              <input
                id="esim-country-input"
                name="countryCode"
                type="text"
                maxLength={2}
                autocomplete="off"
                autocapitalize="characters"
                value={countryCode()}
                onInput={(e) =>
                  setCountryCode(e.currentTarget.value.toUpperCase())
                }
                placeholder="Or enter an ISO country code (e.g. PT)"
                class="w-72 rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
              <select
                aria-label="Region"
                value={region()}
                onChange={(e) =>
                  setRegion(
                    e.currentTarget.value === "global"
                      ? "global"
                      : e.currentTarget.value === "local"
                        ? "local"
                        : "",
                  )
                }
                class="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="">Any region</option>
                <option value="local">Local only</option>
                <option value="global">Global roaming</option>
              </select>
              <select
                aria-label="Minimum data"
                value={String(minDataGb())}
                onChange={(e) =>
                  setMinDataGb(Number.parseFloat(e.currentTarget.value) || 0)
                }
                class="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="0">Any data size</option>
                <option value="1">1 GB and up</option>
                <option value="3">3 GB and up</option>
                <option value="5">5 GB and up</option>
                <option value="10">10 GB and up</option>
                <option value="20">20 GB and up</option>
              </select>
            </div>
          </div>
        </section>

        {/* Results */}
        <section class="mx-auto max-w-5xl px-6 pb-20">
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
                Loading travel eSIM plans…
              </div>
            }
          >
            {(() => {
              const data = results();
              if (!data) return null;
              if (data.packages.length === 0) {
                return (
                  <div
                    class="rounded-2xl p-10 text-center"
                    style={{
                      border: "1px dashed var(--color-border)",
                      background: "var(--color-bg-subtle)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    No plans match those filters right now. Try broadening the
                    country or lowering the minimum data size.
                  </div>
                );
              }
              return (
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={data.packages}>
                    {(pkg) => {
                      const tone = regionBadgeTone(pkg.type);
                      return (
                        <article
                          class="flex flex-col rounded-2xl p-5"
                          style={{
                            border: "1px solid var(--color-border)",
                            background: "var(--color-bg-elevated)",
                          }}
                        >
                          <header class="flex items-center justify-between gap-3">
                            <span
                              class="text-sm font-semibold"
                              style={{ color: "var(--color-text)" }}
                            >
                              {pkg.operatorTitle}
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
                          </header>
                          <p
                            class="mt-2 text-base font-medium"
                            style={{ color: "var(--color-text)" }}
                          >
                            {pkg.title}
                          </p>
                          <dl class="mt-3 space-y-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                            <div class="flex items-center justify-between gap-2">
                              <dt>Data</dt>
                              <dd>{formatDataLabel(pkg.dataGb, pkg.isUnlimited)}</dd>
                            </div>
                            <div class="flex items-center justify-between gap-2">
                              <dt>Valid for</dt>
                              <dd>{pkg.validityDays} days</dd>
                            </div>
                            <Show when={pkg.countryCode}>
                              <div class="flex items-center justify-between gap-2">
                                <dt>Country</dt>
                                <dd>{pkg.countryCode}</dd>
                              </div>
                            </Show>
                          </dl>
                          <footer class="mt-4 flex items-center justify-between gap-3">
                            <div>
                              <div
                                class="text-xl font-semibold"
                                style={{ color: "var(--color-text)" }}
                              >
                                {formatRetail(pkg.retailMicrodollars)}
                              </div>
                              <div
                                class="text-[10px]"
                                style={{ color: "var(--color-text-faint)" }}
                              >
                                USD · one-time
                              </div>
                            </div>
                            <A
                              href={`/esim?buy=${encodeURIComponent(pkg.id)}`}
                              aria-label={`Buy ${pkg.title}`}
                              class="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition"
                              style={{
                                background: "var(--color-primary)",
                                color: "var(--color-primary-fg)",
                              }}
                            >
                              Buy
                            </A>
                          </footer>
                          <Show when={pkg.isUnlimited}>
                            <div class="mt-3">
                              <Badge variant="success">Unlimited</Badge>
                            </div>
                          </Show>
                        </article>
                      );
                    }}
                  </For>
                </div>
              );
            })()}
          </Show>

          <div class="mt-12 flex items-center justify-center">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCountryCode("");
                setRegion("");
                setMinDataGb(0);
              }}
            >
              Reset filters
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
