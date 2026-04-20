import type { JSX } from "solid-js";

// ── Platform Cross-Sell Card ────────────────────────────────────────
// Shown on the customer dashboard empty state (or to newly-signed-up
// users) as a gentle introduction to the two sibling products. No
// shared auth yet — just plain outbound links.
//
// Copy is intentionally short and non-pushy. "Pairs well with" beats
// hard-sell CTAs for a card aimed at customers still finding their
// feet in Crontech — we do not want to drown them in cross-sell.

interface SiblingLink {
  product: "gluecron" | "gatetest";
  name: string;
  blurb: string;
  href: string;
  cta: string;
  icon: string;
}

const SIBLINGS: SiblingLink[] = [
  {
    product: "gluecron",
    name: "Gluecron",
    blurb: "Git hosting",
    href: "https://gluecron.com",
    cta: "Visit Gluecron",
    icon: "\u{1F5C2}",
  },
  {
    product: "gatetest",
    name: "GateTest",
    blurb: "Preview environments",
    href: "https://gatetest.io",
    cta: "Visit GateTest",
    icon: "\u{1F9EA}",
  },
];

export function PlatformCrossSellCard(): JSX.Element {
  return (
    <div
      class="relative overflow-hidden rounded-xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 100% 0%, var(--color-primary-light), transparent 60%)",
        }}
      />
      <div class="relative flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <span
            class="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-faint)" }}
          >
            Pairs well with
          </span>
          <h3
            class="text-lg font-bold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            Crontech plus Gluecron and GateTest
          </h3>
          <p
            class="max-w-xl text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Two sibling products that fit alongside Crontech — Gluecron for
            git hosting and GateTest for preview environments. Same team,
            same feel, no new account needed to take a look.
          </p>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SIBLINGS.map((sibling) => (
            <a
              href={sibling.href}
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors duration-150"
              style={{
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                "text-decoration": "none",
              }}
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                style={{
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary-text)",
                }}
              >
                {sibling.icon}
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span
                  class="text-sm font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  {sibling.name}
                </span>
                <span
                  class="text-[11px]"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  {sibling.blurb}
                </span>
              </span>
              <span
                class="shrink-0 text-xs font-medium"
                style={{ color: "var(--color-primary-text)" }}
              >
                {sibling.cta} &#8594;
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
