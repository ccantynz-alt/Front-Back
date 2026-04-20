// ── PreLaunchBilling — /billing pre-launch surface ───────────────────
// Rendered in place of the checkout UI whenever the billing backend
// reports `{ enabled: false }` (i.e. the `STRIPE_ENABLED` env var is
// unset or not "true"). Shows an aggressive, premium "launching soon"
// message + an email waitlist capture so we don't bleed intent while
// Stripe is gated.
//
// When billing flips to enabled (env flag -> "true" + worker redeploy
// picks up the new value) the `/billing` route swaps back to the real
// checkout UI automatically — no code change needed on the UI side.
//
// Why a component, not an inline block:
//   - Keeps the billing route legible.
//   - Lets us reuse the same waitlist surface from /pricing or any
//     other gated surface with no duplication.
//   - Testable in isolation.

import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { trpc } from "../lib/trpc";
import { friendlyError } from "../lib/use-trpc";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PreLaunchBilling(): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [success, setSuccess] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    const value = email().trim();
    if (!EMAIL_RE.test(value)) {
      setError("Enter a valid email address so we know where to reach you.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await trpc.billing.joinWaitlist.mutate({ email: value });
      setSuccess(true);
      setEmail("");
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      class="relative overflow-hidden rounded-3xl p-10 sm:p-14"
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(14,165,233,0.06) 100%), var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.25), transparent)" }}
      />
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -left-24 -bottom-24 h-64 w-64 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(14,165,233,0.18), transparent)" }}
      />

      <div class="relative z-10 max-w-2xl">
        <div
          class="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
          style={{
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
            color: "#f59e0b",
          }}
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            style={{ background: "#f59e0b", "box-shadow": "0 0 8px rgba(245,158,11,0.8)" }}
          />
          Pre-launch
        </div>

        <h2
          class="text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
          style={{ color: "var(--color-text)" }}
        >
          Billing is launching soon.
        </h2>
        <p
          class="mt-3 text-base leading-relaxed sm:text-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Join the waitlist for early access. We'll email you the moment paid
          plans open — alongside the launch-day founder pricing that won't be
          offered again.
        </p>

        <Show
          when={!success()}
          fallback={
            <div
              class="mt-8 rounded-2xl p-5"
              style={{
                background: "var(--color-success-bg)",
                border: "1px solid var(--color-success-border, rgba(34,197,94,0.35))",
                color: "var(--color-success)",
              }}
            >
              <p class="text-sm font-semibold">You're on the list.</p>
              <p class="mt-1 text-xs opacity-90">
                We'll reach out the moment billing opens. No spam, ever.
              </p>
            </div>
          }
        >
          <form
            class="mt-8 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
          >
            <label class="sr-only" for="prelaunch-billing-email">Email address</label>
            <input
              id="prelaunch-billing-email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@company.com"
              value={email()}
              onInput={(event) => setEmail(event.currentTarget.value)}
              disabled={submitting()}
              class="flex-1 rounded-xl px-4 py-3 text-sm transition-colors duration-150 focus:outline-none disabled:opacity-50"
              style={{
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            />
            <button
              type="submit"
              disabled={submitting()}
              class="rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-150 disabled:opacity-50"
              style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
            >
              {submitting() ? "Adding you…" : "Notify me"}
            </button>
          </form>
        </Show>

        <Show when={error()}>
          {(msg) => (
            <p class="mt-3 text-xs font-medium" style={{ color: "var(--color-danger-text)" }}>
              {msg()}
            </p>
          )}
        </Show>

        <p class="mt-6 text-[11px]" style={{ color: "var(--color-text-faint)" }}>
          Already subscribed via an earlier invite? Contact support and we'll
          migrate you the moment billing comes online.
        </p>
      </div>
    </div>
  );
}
