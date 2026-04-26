// ── SMS API: Public Product Page (Coming Soon) ──────────────────────
//
// Marketing page for the Crontech SMS API. Vendor signup is still
// pending, so the page is in a "Coming Soon" state: it describes the
// capability, collects waitlist interest, and offers no customer
// action beyond the waitlist form.
//
// No waitlist tRPC procedure exists yet (checked apps/api/src/trpc/
// procedures/ — nothing named waitlist.*), so the submit handler
// shows a polite confirmation alert. When a procedure lands the
// handler swaps over — the form shape is already compatible.
//
// Polite copy only. No competitor names. Dark Stripe-direction hero
// to match the landing page aesthetic. Zero HTML — SolidJS JSX only.

import { createSignal, For, Show, type JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Feature bullets ────────────────────────────────────────────────

interface SmsFeature {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

const SMS_FEATURES: ReadonlyArray<SmsFeature> = [
  {
    icon: "radio",
    title: "Send + receive, worldwide",
    description:
      "A single REST endpoint for outbound SMS across every country carriers reach, plus inbound webhooks that deliver replies to your server within seconds.",
  },
  {
    icon: "wifi",
    title: "Numbers you actually own",
    description:
      "Provision long codes, short codes, toll-free, and alphanumeric senders from a global pool. Port existing numbers in, keep delivery receipts, and release when you're done.",
  },
  {
    icon: "zap",
    title: "Segment-based pricing",
    description:
      "Pay per 160-character segment, not per message. Transparent per-country rates, volume discounts kick in automatically, and every send shows the exact cost before it leaves.",
  },
];

// ── Waitlist helpers (exported for tests) ──────────────────────────

/**
 * Minimal email sanity check — enough to catch typos before we even
 * try to submit. The server will be the final arbiter once the
 * waitlist procedure ships.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  if (!trimmed.includes("@")) return false;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

// ── Code snippet (shown even in Coming Soon — gives a taste) ───────

export const SMS_SNIPPET = `// What it will look like once the API is live
await trpc.sms.send.mutate({
  to: "+14155550123",
  from: "+14155550100",
  body: "Your Crontech verification code is 492031.",
});`;

// ── Page ───────────────────────────────────────────────────────────

export default function SmsPage(): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [submitted, setSubmitted] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function onSubmit(ev: SubmitEvent): void {
    ev.preventDefault();
    const value = email().trim();
    if (!isPlausibleEmail(value)) {
      setError("That email doesn't look quite right — please check and try again.");
      return;
    }
    setError(null);
    // No waitlist tRPC procedure exists yet. When one lands, call it
    // here. The inline <Show when={submitted()}> confirmation below
    // is the polite response — avoid window.alert (cheap-looking on
    // desktop, hostile on iOS Safari).
    setSubmitted(true);
  }

  return (
    <>
      <SEOHead
        title="SMS API"
        description="A first-party SMS API for Crontech — send and receive worldwide, inbound webhooks, global numbers, segment-based pricing. Coming soon."
        path="/sms"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0f" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          <div
            class="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px 500px at 50% -10%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(800px 400px at 85% 20%, rgba(99,102,241,0.12), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div class="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: "#fbbf24" }}
                aria-hidden="true"
              />
              Coming soon
            </span>
            <h1
              class="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              style={{ color: "#f0f0f5" }}
            >
              SMS, on a first-party API
            </h1>
            <p
              class="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              A clean, predictable SMS API built into the Crontech platform.
              Send, receive, rent numbers, and price every segment without
              leaving your dashboard. Vendor integration is in the final
              stretch — drop your email below and we'll let you know the
              moment it ships.
            </p>
          </div>
        </section>

        {/* ── Description ─────────────────────────────────────── */}
        <section class="mx-auto max-w-3xl px-6 pb-12">
          <div class="space-y-5 text-base leading-[1.8]" style={{ color: "rgba(255,255,255,0.72)" }}>
            <p>
              Crontech SMS gives you the same capabilities most teams cobble
              together from a legacy messaging vendor — outbound sends,
              inbound webhooks, delivery receipts, number provisioning,
              alphanumeric sender IDs — exposed as a single, typed API that
              shares auth, audit logs, and billing with the rest of Crontech.
            </p>
            <p>
              Pricing is segment-based and transparent. You see the exact
              cost of a send before it's queued, volume discounts apply
              automatically, and there is no surcharge for a dashboard or a
              "success manager." If you don't send, you don't pay.
            </p>
            <p>
              We're holding the launch until the upstream carrier partner
              finishes onboarding, so numbers are provisioned cleanly on day
              one. Join the waitlist and we'll email you the moment the
              gates open.
            </p>
          </div>
        </section>

        {/* ── Waitlist form ───────────────────────────────────── */}
        <section class="mx-auto max-w-2xl px-6 pb-16">
          <form
            onSubmit={onSubmit}
            class="rounded-2xl p-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <label
              for="sms-waitlist-email"
              class="text-sm font-medium"
              style={{ color: "#e5e5e5" }}
            >
              Email me when it's live
            </label>
            <div class="mt-3 flex flex-wrap items-stretch gap-2">
              <input
                id="sms-waitlist-email"
                name="email"
                type="email"
                autocomplete="email"
                inputmode="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="you@example.com"
                class="min-w-0 flex-1 rounded-lg px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#f0f0f5",
                }}
              />
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#ffffff",
                  "box-shadow": "0 8px 24px -8px rgba(99,102,241,0.55)",
                }}
              >
                Join waitlist
              </button>
            </div>
            <Show when={error()}>
              <p
                class="mt-3 text-xs"
                style={{ color: "#fca5a5" }}
                role="alert"
              >
                {error()}
              </p>
            </Show>
            <Show when={submitted() && !error()}>
              <p
                class="mt-3 text-xs"
                style={{ color: "#86efac" }}
              >
                Thanks — we'll email you the moment the SMS API is live.
              </p>
            </Show>
            <p
              class="mt-4 text-[11px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              One email, only when it's live. No marketing list.
            </p>
          </form>
        </section>

        {/* ── Feature bullets ─────────────────────────────────── */}
        <section class="mx-auto max-w-5xl px-6 pb-16">
          <div class="grid gap-5 md:grid-cols-3">
            <For each={SMS_FEATURES}>
              {(feat) => (
                <article
                  class="rounded-2xl p-6"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    "box-shadow": "0 2px 8px rgba(0,0,0,0.2)",
                  }}
                >
                  <div
                    class="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(99,102,241,0.15))",
                      color: "#93c5fd",
                      border: "1px solid rgba(56,189,248,0.2)",
                    }}
                  >
                    <Icon name={feat.icon} size={20} />
                  </div>
                  <h2
                    class="mt-5 text-[1.0625rem] font-semibold tracking-tight"
                    style={{ color: "#f0f0f5" }}
                  >
                    {feat.title}
                  </h2>
                  <p
                    class="mt-2 text-sm leading-[1.75]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {feat.description}
                  </p>
                </article>
              )}
            </For>
          </div>
        </section>

        {/* ── Preview snippet ─────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-24">
          <h2
            class="text-2xl font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            A glimpse of the API
          </h2>
          <p
            class="mt-2 text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Final shape may settle a hair before GA — but this is the plan.
          </p>
          <pre
            class="mt-5 overflow-x-auto rounded-2xl p-5 text-[13px] leading-[1.7]"
            style={{
              background: "rgba(8, 8, 14, 0.75)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e5e7eb",
              "font-family":
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            <code>{SMS_SNIPPET}</code>
          </pre>
        </section>
      </div>
    </>
  );
}
