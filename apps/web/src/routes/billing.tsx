import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

interface UsageMeter {
  label: string;
  current: number;
  limit: number;
  unit: string;
  accentColor: string;
  icon: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: "paid" | "pending" | "failed";
  period: string;
}

// ── Mock Data ────────────────────────────────────────────────────────

const USAGE_METERS: UsageMeter[] = [
  { label: "API Calls", current: 847_293, limit: 1_000_000, unit: "calls", accentColor: "#3b82f6", icon: "&#9889;" },
  { label: "AI Tokens", current: 12_400_000, limit: 50_000_000, unit: "tokens", accentColor: "#8b5cf6", icon: "&#129302;" },
  { label: "Storage", current: 28.4, limit: 50, unit: "GB", accentColor: "#10b981", icon: "&#128451;" },
  { label: "Collaborators", current: 8, limit: 25, unit: "seats", accentColor: "#f59e0b", icon: "&#128101;" },
];

const INVOICES: Invoice[] = [
  { id: "INV-2026-004", date: "Apr 1, 2026", amount: "$29.00", status: "pending", period: "Apr 2026" },
  { id: "INV-2026-003", date: "Mar 1, 2026", amount: "$29.00", status: "paid", period: "Mar 2026" },
  { id: "INV-2026-002", date: "Feb 1, 2026", amount: "$29.00", status: "paid", period: "Feb 2026" },
  { id: "INV-2026-001", date: "Jan 1, 2026", amount: "$29.00", status: "paid", period: "Jan 2026" },
  { id: "INV-2025-012", date: "Dec 1, 2025", amount: "$29.00", status: "paid", period: "Dec 2025" },
];

// ── Usage Meter Component ────────────────────────────────────────────

function UsageMeterCard(props: { meter: UsageMeter }): JSX.Element {
  const percentage = (): number => Math.min((props.meter.current / props.meter.limit) * 100, 100);
  const isNearLimit = (): boolean => percentage() > 80;

  const formatValue = (val: number): string => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
    return val.toString();
  };

  return (
    <div
      class="group relative overflow-hidden rounded-2xl border border-white/[0.06] p-5 transition-all duration-300 hover:border-white/[0.12]"
      style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
    >
      <div
        class="absolute -top-10 -right-10 h-24 w-24 rounded-full opacity-15 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: props.meter.accentColor }}
      />

      <div class="relative z-10">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
              style={{
                background: `${props.meter.accentColor}18`,
                color: props.meter.accentColor,
              }}
              innerHTML={props.meter.icon}
            />
            <span class="text-sm font-medium text-gray-300">{props.meter.label}</span>
          </div>
          <Show when={isNearLimit()}>
            <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-400">Near Limit</span>
          </Show>
        </div>

        <div class="mb-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold text-white">
            {typeof props.meter.current === "number" && props.meter.current >= 1000
              ? formatValue(props.meter.current)
              : props.meter.current}
          </span>
          <span class="text-xs text-gray-600">
            of {typeof props.meter.limit === "number" && props.meter.limit >= 1000
              ? formatValue(props.meter.limit)
              : props.meter.limit} {props.meter.unit}
          </span>
        </div>

        {/* Progress Bar */}
        <div class="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full transition-all duration-700"
            style={{
              width: `${percentage()}%`,
              background: isNearLimit()
                ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                : `linear-gradient(90deg, ${props.meter.accentColor}80, ${props.meter.accentColor})`,
              "box-shadow": `0 0 12px ${props.meter.accentColor}40`,
            }}
          />
        </div>

        <div class="mt-2 text-right text-[11px] text-gray-600">{percentage().toFixed(1)}% used</div>
      </div>
    </div>
  );
}

// ── Invoice Status Badge ─────────────────────────────────────────────

function InvoiceStatus(props: { status: "paid" | "pending" | "failed" }): JSX.Element {
  const config = (): { color: string; label: string } => {
    switch (props.status) {
      case "paid":
        return { color: "#10b981", label: "Paid" };
      case "pending":
        return { color: "#f59e0b", label: "Pending" };
      case "failed":
        return { color: "#ef4444", label: "Failed" };
    }
  };

  return (
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `${config().color}15`, color: config().color }}
    >
      <span class="h-1.5 w-1.5 rounded-full" style={{ background: config().color }} />
      {config().label}
    </span>
  );
}

// ── Billing Page ─────────────────────────────────────────────────────

export default function BillingPage(): JSX.Element {
  const [showCancelConfirm, setShowCancelConfirm] = createSignal(false);

  return (
    <div class="min-h-screen bg-[#060606]">
      <Title>Billing - Crontech</Title>

      <div class="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div class="mb-8">
          <h1 class="text-3xl font-bold tracking-tight text-white">Billing</h1>
          <p class="mt-1 text-sm text-gray-500">Manage your subscription, usage, and payment methods</p>
        </div>

        {/* Current Plan */}
        <div
          class="relative mb-8 overflow-hidden rounded-2xl border border-white/[0.06] p-6"
          style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
        >
          <div class="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-15 blur-3xl" style={{ background: "#3b82f6" }} />

          <div class="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-5">
              <div
                class="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                style={{ background: "linear-gradient(135deg, #3b82f630, #8b5cf660)" }}
              >
                <span style={{ color: "#a78bfa" }}>&#9889;</span>
              </div>
              <div>
                <div class="flex items-center gap-3">
                  <h2 class="text-xl font-bold text-white">Pro Plan</h2>
                  <span class="rounded-full bg-blue-500/15 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">Active</span>
                </div>
                <p class="mt-0.5 text-sm text-gray-500">$29/month, billed monthly. Renews Apr 30, 2026</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/40 hover:brightness-110"
              >
                Upgrade to Enterprise
              </button>
              <button
                type="button"
                class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:text-white"
              >
                Manage Plan
              </button>
            </div>
          </div>

          {/* Plan Stats Row */}
          <div class="relative z-10 mt-6 grid grid-cols-2 gap-4 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 sm:grid-cols-4">
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-widest text-gray-600">Monthly Cost</span>
              <span class="text-lg font-bold text-white">$29.00</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-widest text-gray-600">Next Payment</span>
              <span class="text-lg font-bold text-white">Apr 30</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-widest text-gray-600">Member Since</span>
              <span class="text-lg font-bold text-white">Jan 2026</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-widest text-gray-600">Billing Cycle</span>
              <span class="text-lg font-bold text-white">Monthly</span>
            </div>
          </div>

          <div
            class="absolute bottom-0 left-0 h-[2px] w-full opacity-60"
            style={{ background: "linear-gradient(90deg, transparent, #3b82f6, #8b5cf6, transparent)" }}
          />
        </div>

        {/* Usage Meters */}
        <div class="mb-8">
          <h2 class="mb-4 text-lg font-semibold text-white">Usage This Period</h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={USAGE_METERS}>
              {(meter) => <UsageMeterCard meter={meter} />}
            </For>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Invoice History - 2 cols */}
          <div class="lg:col-span-2">
            <div
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <div class="mb-5 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-white">Invoice History</h2>
                <button type="button" class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:text-white">
                  Download All
                </button>
              </div>

              {/* Table Header */}
              <div class="mb-2 grid grid-cols-5 gap-4 px-4 py-2">
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Invoice</span>
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Date</span>
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Amount</span>
                <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Status</span>
                <span class="text-right text-[10px] font-semibold uppercase tracking-widest text-gray-600">Action</span>
              </div>

              <div class="flex flex-col gap-1.5">
                <For each={INVOICES}>
                  {(invoice) => (
                    <div class="grid grid-cols-5 items-center gap-4 rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3 transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.03]">
                      <span class="text-xs font-medium text-gray-300">{invoice.id}</span>
                      <span class="text-xs text-gray-500">{invoice.date}</span>
                      <span class="text-xs font-semibold text-white">{invoice.amount}</span>
                      <InvoiceStatus status={invoice.status} />
                      <div class="text-right">
                        <button type="button" class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[10px] font-medium text-gray-400 transition-all hover:text-white">
                          Download
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Payment Method - right col */}
          <div class="flex flex-col gap-6">
            <div
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <h2 class="mb-5 text-lg font-semibold text-white">Payment Method</h2>
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div class="flex items-center gap-4">
                  <div class="flex h-12 w-18 items-center justify-center rounded-lg bg-gradient-to-r from-blue-700 to-blue-900 px-3 text-xs font-bold text-white">
                    VISA
                  </div>
                  <div class="flex flex-1 flex-col">
                    <span class="text-sm font-medium text-gray-200">Visa ending in 1234</span>
                    <span class="text-xs text-gray-500">Expires 08/2028</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-xs font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:text-white"
              >
                Update Payment Method
              </button>
            </div>

            {/* Billing Address */}
            <div
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <h2 class="mb-4 text-lg font-semibold text-white">Billing Address</h2>
              <div class="flex flex-col gap-1 text-sm text-gray-400">
                <span>Craig Robertson</span>
                <span>Crontech Inc.</span>
                <span>123 Innovation Drive</span>
                <span>San Francisco, CA 94105</span>
                <span>United States</span>
              </div>
              <button
                type="button"
                class="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:text-white"
              >
                Edit Address
              </button>
            </div>

            {/* Cancel Plan */}
            <Show
              when={!showCancelConfirm()}
              fallback={
                <div class="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                  <p class="mb-3 text-sm text-red-400">
                    Your plan will remain active until the end of the current billing period (Apr 30, 2026). After that, you will be moved to the Free plan.
                  </p>
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all hover:text-white"
                    >
                      Keep Plan
                    </button>
                    <button
                      type="button"
                      class="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-red-500"
                    >
                      Confirm Cancellation
                    </button>
                  </div>
                </div>
              }
            >
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                class="text-center text-xs text-gray-600 transition-colors duration-200 hover:text-gray-400"
              >
                Cancel Plan
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
