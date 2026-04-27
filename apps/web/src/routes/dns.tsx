// ── Authoritative DNS: Public Product Page ──────────────────────────
//
// Marketing page for the Crontech Authoritative DNS product. Describes
// the self-hosted auth DNS service, zone management, the admin UI at
// /admin/dns, and the Cloudflare-import tool — and points signed-in
// operators straight to the admin console.
//
// Polite copy only. No competitor names. Dark Stripe-direction hero
// to match the landing page aesthetic. Zero HTML — SolidJS JSX only.
// Matches the doctrine in CLAUDE.md §6.3 (Zod-less copy pages keep
// their content local because there is no user input).

import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Feature bullets ────────────────────────────────────────────────

interface DnsFeature {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

const DNS_FEATURES: ReadonlyArray<DnsFeature> = [
  {
    icon: "zap",
    title: "Authoritative, at the edge",
    description:
      "Crontech answers every query for your zones directly — no third-party resolver in the middle. Global anycast, sub-50 ms response times, SOA and NS records we own end-to-end.",
  },
  {
    icon: "database",
    title: "Zone management in one console",
    description:
      "Create zones, add A, AAAA, CNAME, MX, TXT, SRV, and CAA records, and track serial bumps from a single admin page. Every change is audit-logged.",
  },
  {
    icon: "link-2",
    title: "One-click import",
    description:
      "Paste your existing zone file or connect a Cloudflare account and Crontech pulls every record across. Review the diff, confirm, and flip the nameservers when you are ready.",
  },
];

// ── Code snippet (tRPC + curl) ─────────────────────────────────────

// Shown in the "how it looks from code" block. Kept as plain strings
// so the link-checker / button-checker don't misread embedded JSX.
export const DNS_TRPC_SNIPPET = `// Create a zone programmatically
await trpc.dns.createZone.mutate({
  zoneName: "example.com",
  adminEmail: "hostmaster@example.com",
  primaryNs: "ns1.crontech.net",
});

// Add an A record
await trpc.dns.createRecord.mutate({
  zoneId,
  name: "@",
  type: "A",
  value: "203.0.113.10",
  ttl: 300,
});`;

export const DNS_DIG_SNIPPET = `# Verify propagation from any resolver
$ dig @ns1.crontech.net example.com A +short
203.0.113.10`;

export default function DnsPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Authoritative DNS"
        description="Self-hosted authoritative DNS with global anycast, one-console zone management, and a Cloudflare import tool. Replace third-party DNS with your own, in minutes."
        path="/dns"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0f" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          <div
            class="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px 500px at 50% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(800px 400px at 85% 20%, rgba(139,92,246,0.12), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div class="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{
                background: "rgba(99,102,241,0.12)",
                color: "#a5b4fc",
                border: "1px solid rgba(99,102,241,0.25)",
              }}
            >
              Live product
            </span>
            <h1
              class="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              style={{ color: "#f0f0f5" }}
            >
              Authoritative DNS, run by you
            </h1>
            <p
              class="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Replace third-party DNS with your own, in minutes. Crontech runs
              the nameservers, serves the records, and gives you a single
              console to manage every zone.
            </p>
            <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
              <A
                href="/admin/dns"
                class="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#ffffff",
                  "box-shadow": "0 8px 24px -8px rgba(99,102,241,0.55)",
                }}
              >
                Open DNS admin
                <span aria-hidden="true">{"\u2192"}</span>
              </A>
              <A
                href="/docs"
                class="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "#e5e5e5",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                Read the docs
              </A>
            </div>
          </div>
        </section>

        {/* ── Description ─────────────────────────────────────── */}
        <section class="mx-auto max-w-3xl px-6 pb-16">
          <div class="space-y-5 text-base leading-[1.8]" style={{ color: "rgba(255,255,255,0.72)" }}>
            <p>
              Crontech Authoritative DNS is a self-hosted DNS service. Your
              domains delegate to Crontech nameservers, and every query — from
              the first SOA lookup to the last TXT record — is answered by
              infrastructure you control through the Crontech console. No
              external resolver in the path, no surprise rate limits, no
              opaque dashboards.
            </p>
            <p>
              Zone management, record editing, TTL tuning, and DNSSEC signing
              all live in one place. Changes propagate through the anycast
              fleet in seconds, and every edit lands in the audit log so you
              can answer "who changed that MX record?" without a ticket.
            </p>
            <p>
              Already on another provider? The built-in Cloudflare-import tool
              pulls your zones across, shows you a full diff, and holds the
              nameserver flip until you say go. Migration is a review step,
              not a weekend.
            </p>
          </div>
        </section>

        {/* ── Feature bullets ─────────────────────────────────── */}
        <section class="mx-auto max-w-5xl px-6 pb-16">
          <div class="grid gap-5 md:grid-cols-3">
            <For each={DNS_FEATURES}>
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
                        "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
                      color: "#a5b4fc",
                      border: "1px solid rgba(99,102,241,0.2)",
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

        {/* ── Code snippet ────────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-16">
          <h2
            class="text-2xl font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            Manage zones from code
          </h2>
          <p
            class="mt-2 text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Everything you can do in the console you can do from tRPC with
            full end-to-end types. Drop in the client, call the procedure,
            ship it.
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
            <code>{DNS_TRPC_SNIPPET}</code>
          </pre>
          <pre
            class="mt-4 overflow-x-auto rounded-2xl p-5 text-[13px] leading-[1.7]"
            style={{
              background: "rgba(8, 8, 14, 0.75)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e5e7eb",
              "font-family":
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            <code>{DNS_DIG_SNIPPET}</code>
          </pre>
        </section>

        {/* ── Bottom CTA ──────────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-24">
          <div
            class="rounded-3xl p-10 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.14), rgba(139,92,246,0.10))",
              border: "1px solid rgba(99,102,241,0.22)",
            }}
          >
            <h2
              class="text-2xl font-semibold tracking-tight sm:text-3xl"
              style={{ color: "#f0f0f5" }}
            >
              Ready to take DNS in-house?
            </h2>
            <p
              class="mx-auto mt-3 max-w-xl text-sm sm:text-base"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Create your first zone in the console, or import everything you
              already run elsewhere. Crontech holds your hand through the flip.
            </p>
            <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
              <A
                href="/admin/dns"
                class="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#ffffff",
                  "box-shadow": "0 8px 24px -8px rgba(99,102,241,0.55)",
                }}
              >
                Open DNS admin
                <span aria-hidden="true">{"\u2192"}</span>
              </A>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
