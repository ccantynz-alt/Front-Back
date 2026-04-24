import { Title } from "@solidjs/meta";
import { createEffect, createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "../../lib/trpc";
import { useAuth } from "../../stores";

// ── /checkout/:plan ─────────────────────────────────────────────────
//
// Auth-gated Stripe handoff. Pricing page sends users here; this route:
//   1. Bounces logged-out users to /register?plan=<plan>&return=/checkout/<plan>
//      (register completes, then hops back here to finish checkout).
//   2. For logged-in users, resolves the Stripe price ID for <plan> by
//      calling trpc.billing.getPlans.query() and matching by id, then
//      fires trpc.billing.createCheckoutSession.mutate() and redirects
//      the browser to Stripe's hosted checkout URL.
//   3. Handles the known pre-launch error shapes (PRECONDITION_FAILED)
//      and renders clean, scoped messages instead of dumping raw errors.
//
// The page is a thin orchestrator — we intentionally do NOT render the
// full pricing UI here. Users already picked a plan; we're just routing
// them to Stripe with the right price ID attached.

type CheckoutState =
  | { kind: "redirecting" }           // bouncing to register or Stripe
  | { kind: "loading" }                // calling getPlans / createCheckoutSession
  | { kind: "missing-price" }          // STRIPE_PRICE_* env var not set
  | { kind: "unknown-plan"; plan: string } // /checkout/foo — plan doesn't exist
  | { kind: "error"; message: string };

export default function CheckoutPlanPage(): JSX.Element {
  const params = useParams<{ plan: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const [state, setState] = createSignal<CheckoutState>({ kind: "loading" });

  // Drive the full auth-check + Stripe handoff from a single effect so
  // hot-reload and the SolidStart first paint both kick the flow without
  // doubling up. The mutation is fire-once per mount — any transient
  // failure surfaces as an error state the user can recover from via the
  // back-to-pricing link rather than silently retrying.
  createEffect((): void => {
    const plan = params.plan;
    if (!plan) {
      setState({ kind: "unknown-plan", plan: "" });
      return;
    }

    // Enterprise never self-serves — if someone hand-types /checkout/enterprise,
    // send them to the sales-led funnel instead of attempting Stripe.
    if (plan === "enterprise") {
      setState({ kind: "redirecting" });
      window.location.href = "/support?topic=enterprise";
      return;
    }

    // Free "checkout" means sign up — there's no Stripe session to create.
    if (plan === "free") {
      setState({ kind: "redirecting" });
      navigate("/register?plan=free", { replace: true });
      return;
    }

    // Auth gate. useAuth hydrates synchronously from localStorage cache,
    // so isAuthenticated() is stable by the time this effect runs. If
    // auth later flips to false (e.g. session expired mid-session), the
    // effect re-runs and the redirect fires then.
    if (!auth.isAuthenticated()) {
      setState({ kind: "redirecting" });
      const returnPath = `/checkout/${plan}`;
      navigate(
        `/register?plan=${encodeURIComponent(plan)}&return=${encodeURIComponent(returnPath)}`,
        { replace: true },
      );
      return;
    }

    void startCheckout(plan);
  });

  const startCheckout = async (plan: string): Promise<void> => {
    setState({ kind: "loading" });
    try {
      const plans = await trpc.billing.getPlans.query();
      const match = (plans ?? []).find(
        (p) => p.id.toLowerCase() === plan.toLowerCase(),
      );
      if (!match) {
        setState({ kind: "unknown-plan", plan });
        return;
      }
      const priceId = match.stripePriceId;
      if (!priceId) {
        setState({ kind: "missing-price" });
        return;
      }

      const result = await trpc.billing.createCheckoutSession.mutate({ priceId });
      if (!result?.url) {
        setState({
          kind: "error",
          message: "Stripe didn't return a checkout URL. Please try again in a moment.",
        });
        return;
      }
      setState({ kind: "redirecting" });
      window.location.href = result.url;
    } catch (err) {
      handleCheckoutError(err);
    }
  };

  const handleCheckoutError = (err: unknown): void => {
    if (err instanceof TRPCClientError) {
      const code = (err.data as { code?: string } | undefined)?.code ?? "";
      const message = err.message ?? "";
      // billing.ts throws PRECONDITION_FAILED for two different things:
      // missing Stripe price config, and (post-merge) unverified email.
      // Disambiguate on message content so each case gets the right UX.
      if (code === "PRECONDITION_FAILED") {
        if (/verif/i.test(message) && /email/i.test(message)) {
          setState({ kind: "redirecting" });
          window.location.href = "/verify-email/pending";
          return;
        }
        setState({ kind: "missing-price" });
        return;
      }
      setState({ kind: "error", message: message || "Checkout failed. Please try again." });
      return;
    }
    const fallback = err instanceof Error ? err.message : "Something went wrong.";
    setState({ kind: "error", message: fallback });
  };

  const planLabel = (): string => {
    const p = params.plan ?? "";
    return p ? p.charAt(0).toUpperCase() + p.slice(1) : "plan";
  };

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Checkout — Crontech</Title>
      <div class="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-24 text-center">
        <Show when={state().kind === "loading" || state().kind === "redirecting"}>
          <div
            class="h-10 w-10 animate-spin rounded-full"
            style={{
              border: "3px solid var(--color-border)",
              "border-top-color": "var(--color-primary)",
            }}
            aria-hidden="true"
          />
          <h1
            class="mt-6 text-xl font-semibold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            Redirecting to secure checkout…
          </h1>
          <p class="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Handing you off to Stripe to finish the {planLabel()} subscription.
          </p>
        </Show>

        <Show when={state().kind === "missing-price"}>
          <h1
            class="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            {planLabel()} checkout isn't configured yet.
          </h1>
          <p class="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Please contact support and we'll get you set up. In the meantime
            you can head back and explore the other plans.
          </p>
          <div class="mt-6 flex gap-3">
            <A
              href="/pricing"
              class="rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
            >
              Back to pricing
            </A>
            <A
              href="/support?topic=checkout"
              class="rounded-xl px-5 py-2.5 text-sm font-medium"
              style={{
                background: "var(--color-bg-muted)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              Contact support
            </A>
          </div>
        </Show>

        <Show when={state().kind === "unknown-plan"}>
          <h1
            class="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            We couldn't find that plan.
          </h1>
          <p class="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Pick a plan from the pricing page to continue to checkout.
          </p>
          <A
            href="/pricing"
            class="mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold"
            style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
          >
            Back to pricing
          </A>
        </Show>

        <Show when={state().kind === "error"}>
          {(() => {
            const s = state();
            const msg = s.kind === "error" ? s.message : "";
            return (
              <>
                <h1
                  class="text-2xl font-bold tracking-tight"
                  style={{ color: "var(--color-text)" }}
                >
                  We couldn't start checkout.
                </h1>
                <p class="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {msg}
                </p>
                <div class="mt-6 flex gap-3">
                  <A
                    href="/pricing"
                    class="rounded-xl px-5 py-2.5 text-sm font-semibold"
                    style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
                  >
                    Back to pricing
                  </A>
                  <A
                    href="/support?topic=checkout"
                    class="rounded-xl px-5 py-2.5 text-sm font-medium"
                    style={{
                      background: "var(--color-bg-muted)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    Contact support
                  </A>
                </div>
              </>
            );
          })()}
        </Show>
      </div>
    </div>
  );
}
