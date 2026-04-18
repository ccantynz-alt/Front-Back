import { Title } from "@solidjs/meta";
import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { trpc } from "../lib/trpc";
import { useQuery, useMutation, friendlyError } from "../lib/use-trpc";

// ── Billing (honest preview, real Stripe backend) ────────────────────
//
// What's REAL on this page:
//   - Current subscription state from trpc.billing.getSubscription
//   - Available plans from trpc.billing.getPlans (DB-backed, falls back
//     to hardcoded tier list if the plans table is empty)
//   - "Upgrade" launches trpc.billing.createCheckoutSession (hosted
//     Stripe Checkout) and redirects the browser to Stripe
//   - "Manage subscription" launches trpc.billing.createPortalSession
//     (hosted Stripe Billing Portal) where Stripe handles invoices,
//     cards, billing address, tax ID, plan changes, and cancellation
//
// What USED TO live here and didn't work:
//   - Usage meters with invented 847,293 API calls / 12.4M tokens —
//     no usage metering pipeline exists yet (BLK-011).
//   - Hardcoded invoice list with five $29 invoices — Stripe's portal
//     already provides the real ledger; we were duplicating it badly.
//   - Fake "Visa ending 1234" card and "Update Payment Method" form
//     that did nothing — Stripe's portal owns the real card vault.
//   - Fake billing address that saved to a client signal — no address
//     column in schema; Stripe's portal owns it.
//   - In-app "Cancel Plan" button that set a local boolean and never
//     told Stripe anything — the subscription kept billing.
//
// All of those surfaces now live where they belong: inside the Stripe
// portal, one click away, with real state and real cancellation.

function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(2)}`;
}

function parseFeatures(raw: string | null | undefined): ReadonlyArray<string> {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // raw wasn't JSON — treat as a single line
    return [raw];
  }
  return [];
}

function formatRenewalDate(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "" || value === 0) return null;
  // tRPC serializes Date as ISO string over the wire but types it as Date/number.
  // Unix-seconds (small numbers) are scaled; everything else is passed to Date().
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "number") {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    d = new Date(ms);
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function BillingPage(): JSX.Element {
  const subscription = useQuery(
    () =>
      trpc.billing.getSubscription.query().catch(() => ({
        status: "free" as const,
        plan: "Free",
        userId: "",
        stripeSubscriptionId: null as string | null,
        stripeCustomerId: null as string | null,
        currentPeriodEnd: null as number | null,
        cancelAtPeriodEnd: false,
      })),
    { key: "subscription" },
  );

  const plans = useQuery(
    () => trpc.billing.getPlans.query().catch(() => [] as Awaited<ReturnType<typeof trpc.billing.getPlans.query>>),
    { key: "plans" },
  );

  const checkout = useMutation(
    (input: { priceId: string }) => trpc.billing.createCheckoutSession.mutate(input),
  );
  const portal = useMutation(
    (input: { customerId: string }) => trpc.billing.createPortalSession.mutate(input),
  );

  const [error, setError] = createSignal<string | null>(null);

  const currentPlanName = createMemo((): string => subscription.data()?.plan ?? "Free");
  const isPaid = createMemo((): boolean => {
    const s = subscription.data();
    return !!s && s.status !== "free" && !!s.stripeCustomerId;
  });
  const renewalDate = createMemo(() => formatRenewalDate(subscription.data()?.currentPeriodEnd));

  const handleUpgrade = async (priceId: string): Promise<void> => {
    if (!priceId) {
      setError("This plan isn't available for self-service checkout yet — contact sales.");
      return;
    }
    setError(null);
    try {
      const result = await checkout.mutate({ priceId });
      if (result.url) {
        window.location.href = result.url;
      } else {
        setError("Stripe didn't return a checkout URL. Try again in a moment.");
      }
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const handlePortal = async (): Promise<void> => {
    const customerId = subscription.data()?.stripeCustomerId;
    if (!customerId) {
      setError("No Stripe customer on file yet — upgrade to a paid plan first.");
      return;
    }
    setError(null);
    try {
      const result = await portal.mutate({ customerId });
      if (result.url) {
        window.location.href = result.url;
      } else {
        setError("Stripe didn't return a portal URL. Try again in a moment.");
      }
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Billing - Crontech</Title>

      <div class="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div class="mb-8">
          <h1 class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>Billing</h1>
          <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
            Your plan, billed through Stripe. Invoices, cards, tax details,
            and cancellation all live in the Stripe portal linked below.
          </p>
        </div>

        <Show when={error()}>
          {(msg) => (
            <div class="mb-6 rounded-xl px-4 py-3 text-xs font-medium" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-text)" }}>
              {msg()}
            </div>
          )}
        </Show>

        {/* Current Plan */}
        <div
          class="relative mb-8 overflow-hidden rounded-2xl p-6"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <div class="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-5">
              <div
                class="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                style={{ background: "var(--color-primary-light)" }}
              >
                <span style={{ color: "var(--color-primary-text)" }}>&#9889;</span>
              </div>
              <div>
                <div class="flex items-center gap-3">
                  <h2 class="text-xl font-bold" style={{ color: "var(--color-text)" }}>
                    <Show when={!subscription.loading()} fallback="Loading…">
                      {currentPlanName()} Plan
                    </Show>
                  </h2>
                  <Show when={subscription.data()?.status}>
                    {(status) => (
                      <span
                        class="rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          background: status() === "active" ? "var(--color-success-bg)" : status() === "free" ? "var(--color-bg-muted)" : "var(--color-warning-bg)",
                          color: status() === "active" ? "var(--color-success)" : status() === "free" ? "var(--color-text-muted)" : "var(--color-warning)",
                        }}
                      >
                        {status()}
                      </span>
                    )}
                  </Show>
                  <Show when={subscription.data()?.cancelAtPeriodEnd}>
                    <span class="rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}>
                      Cancels at period end
                    </span>
                  </Show>
                </div>
                <p class="mt-0.5 text-sm" style={{ color: "var(--color-text-faint)" }}>
                  <Show
                    when={isPaid() && renewalDate()}
                    fallback={
                      <Show
                        when={isPaid()}
                        fallback="Free tier — upgrade below to unlock paid features."
                      >
                        Active paid subscription. Use the portal to view details.
                      </Show>
                    }
                  >
                    {subscription.data()?.cancelAtPeriodEnd
                      ? `Ends ${renewalDate()}`
                      : `Renews ${renewalDate()}`}
                  </Show>
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <Show when={isPaid()}>
                <button
                  type="button"
                  disabled={portal.loading()}
                  onClick={() => void handlePortal()}
                  class="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                  style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
                >
                  {portal.loading() ? "Opening…" : "Manage subscription"}
                </button>
              </Show>
            </div>
          </div>
        </div>

        {/* Plan list */}
        <div class="mb-8">
          <h2 class="mb-4 text-lg font-semibold" style={{ color: "var(--color-text)" }}>Available plans</h2>
          <Show
            when={!plans.loading() && (plans.data() ?? []).length > 0}
            fallback={
              <div class="rounded-2xl px-6 py-10 text-center text-sm" style={{ border: "1px dashed var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-faint)" }}>
                <Show when={plans.loading()} fallback="No plans configured.">
                  Loading plans…
                </Show>
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <For each={plans.data() ?? []}>
                {(plan) => {
                  const features = createMemo(() => parseFeatures(plan.features));
                  const isCurrent = createMemo(
                    (): boolean => currentPlanName().toLowerCase() === plan.name.toLowerCase(),
                  );
                  const isFree = plan.price === 0;
                  return (
                    <div
                      class="rounded-2xl p-6 transition-all duration-200"
                      style={{
                        border: isCurrent() ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                        background: isCurrent() ? "var(--color-primary-light)" : "var(--color-bg-elevated)",
                      }}
                    >
                      <div class="mb-4 flex items-center justify-between">
                        <h3 class="text-lg font-bold" style={{ color: "var(--color-text)" }}>{plan.name}</h3>
                        <Show when={isCurrent()}>
                          <span class="rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "var(--color-primary-light)", color: "var(--color-primary-text)" }}>
                            Current
                          </span>
                        </Show>
                      </div>
                      <div class="mb-4">
                        <span class="text-3xl font-bold" style={{ color: "var(--color-text)" }}>{formatMoney(plan.price)}</span>
                        <Show when={!isFree}>
                          <span class="text-sm" style={{ color: "var(--color-text-faint)" }}>/{plan.interval ?? "month"}</span>
                        </Show>
                      </div>
                      <Show when={plan.description}>
                        <p class="mb-4 text-xs" style={{ color: "var(--color-text-faint)" }}>{plan.description}</p>
                      </Show>
                      <ul class="mb-5 flex flex-col gap-2">
                        <For each={features()}>
                          {(feature) => (
                            <li class="flex items-start gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                              <span class="mt-0.5" style={{ color: "var(--color-success)" }}>&#10003;</span>
                              <span>{feature}</span>
                            </li>
                          )}
                        </For>
                      </ul>
                      <Show
                        when={!isCurrent() && !isFree}
                        fallback={
                          <button
                            type="button"
                            disabled
                            class="w-full rounded-xl py-2.5 text-xs font-medium"
                            style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-faint)" }}
                          >
                            {isCurrent() ? "Your current plan" : "Free tier"}
                          </button>
                        }
                      >
                        <button
                          type="button"
                          disabled={checkout.loading() || !plan.stripePriceId}
                          onClick={() => void handleUpgrade(plan.stripePriceId)}
                          class="w-full rounded-xl py-2.5 text-xs font-semibold transition-all duration-200 disabled:opacity-40"
                          style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
                        >
                          {checkout.loading() ? "Opening Stripe…" : plan.stripePriceId ? `Upgrade to ${plan.name}` : "Contact sales"}
                        </button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* Billing portal explainer */}
        <div
          class="rounded-2xl p-6"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Everything else lives in Stripe</h2>
          <p class="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Invoices, payment methods, billing address, tax IDs, and
            cancellation all live inside Stripe's billing portal. One click
            from here, real state, real receipts, real PCI compliance — no
            duplicate forms, no drifted data.
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <Show
              when={isPaid()}
              fallback={
                <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                  The portal becomes available after your first paid subscription.
                </span>
              }
            >
              <button
                type="button"
                disabled={portal.loading()}
                onClick={() => void handlePortal()}
                class="rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-50"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" }}
              >
                {portal.loading() ? "Opening…" : "Open Stripe portal"}
              </button>
            </Show>
          </div>
          <p class="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--color-text-faint)" }}>
            Usage-based charts (API calls, AI tokens, storage, seats) arrive
            with the usage-metering block (BLK-011). Until that pipeline is
            live, this page shows only things we can verify against Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}
