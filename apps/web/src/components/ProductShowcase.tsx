import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "./Icon";

// ── ProductShowcase ─────────────────────────────────────────────────
//
// The ecosystem grid shown after the six-card IA on the landing page.
// Each card represents one product in the Crontech platform, with a
// status of either "live" (hover-elevated, clickable deep link) or
// "coming-soon" (ghosted, no hover elevation, anchor fallback). The
// component is a pure view — all copy lives in PRODUCTS below and
// is polite per docs/POSITIONING.md (no competitor names).

export type ProductStatus = "live" | "coming-soon";

export interface Product {
  icon: IconName;
  title: string;
  description: string;
  href: string;
  status: ProductStatus;
}

// ── Data ────────────────────────────────────────────────────────────
//
// All eight routes now resolve to real pages — /dns and /sms landed
// in the parallel agent's commit. SMS + eSIM still carry a polite
// "coming soon" badge because the API surfaces are not production-
// ready yet, but the deep link resolves so the link-checker stays
// green and curious visitors can read the product pitch.

export const PRODUCTS: Product[] = [
  {
    icon: "cloud",
    title: "Hosting & Deploy",
    description: "Git-push deploys to the global edge. Zero containers, zero capacity planning.",
    href: "/deployments",
    status: "live",
  },
  {
    icon: "database",
    title: "Edge Database",
    description: "Turso SQLite replicas, Neon Postgres, and Qdrant vector search — one unified data layer.",
    href: "/database",
    status: "live",
  },
  {
    icon: "globe",
    title: "Authoritative DNS",
    description: "Anycast DNS with DNSSEC, instant propagation, and a clean API.",
    href: "/dns",
    status: "live",
  },
  {
    icon: "layers",
    title: "Domain Registration",
    description: "Register, transfer, and manage domains without leaving the dashboard.",
    href: "/domains",
    status: "live",
  },
  {
    icon: "brain",
    title: "AI Runtime",
    description: "Three-tier compute with BYOK routing. Client GPU, edge, or cloud H100s on demand.",
    href: "/chat",
    status: "live",
  },
  {
    icon: "radio",
    title: "Real-Time",
    description: "SSE, WebSockets, and Yjs CRDTs on every edge node. Multi-user ready out of the box.",
    href: "/chat",
    status: "live",
  },
  {
    icon: "message-square",
    title: "SMS API",
    description: "Global programmable SMS with delivery reports and two-way messaging.",
    href: "/sms",
    status: "coming-soon",
  },
  {
    icon: "smartphone",
    title: "eSIM API",
    description: "Instant data plans for 190+ countries. QR install or direct provisioning.",
    href: "/esim",
    status: "coming-soon",
  },
];

// ── Card ────────────────────────────────────────────────────────────

function ProductCard(props: Product): JSX.Element {
  const isLive = (): boolean => props.status === "live";

  return (
    <A
      href={props.href}
      class={
        isLive()
          ? "product-card product-card-live block group"
          : "product-card product-card-soon block group"
      }
      style={{ "text-decoration": "none" }}
      aria-label={`${props.title} — ${props.status === "live" ? "available now" : "coming soon"}`}
    >
      <div class="flex h-full flex-col gap-5 p-7">
        <div class="flex items-start justify-between gap-3">
          <div class="product-card-icon">
            <Icon name={props.icon} size={20} />
          </div>
          <Show
            when={isLive()}
            fallback={<span class="product-badge product-badge-soon">Coming soon</span>}
          >
            <span class="product-badge product-badge-live">
              <span class="product-badge-dot" aria-hidden="true" />
              Live
            </span>
          </Show>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3 class="product-card-title">{props.title}</h3>
          <p class="product-card-desc">{props.description}</p>
        </div>

        <Show when={isLive()}>
          <div class="product-card-cta mt-auto pt-3">
            <span>Learn more</span>
            <span class="product-card-cta-arrow" aria-hidden="true">
              {"\u2192"}
            </span>
          </div>
        </Show>
      </div>
    </A>
  );
}

// ── Section ─────────────────────────────────────────────────────────

export interface ProductShowcaseProps {
  /** Optional override for the list of products, used in tests. */
  products?: readonly Product[] | undefined;
}

export function ProductShowcase(props: ProductShowcaseProps): JSX.Element {
  const items = (): readonly Product[] => props.products ?? PRODUCTS;

  return (
    <section class="landing-dark-section product-showcase-section py-32 lg:py-44">
      <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div class="mb-20 flex flex-col items-center text-center">
          <div class="landing-section-label">
            <div class="landing-section-label-dot" aria-hidden="true" />
            Ecosystem
          </div>
          <h2 class="product-showcase-title">Everything one platform can be</h2>
          <p class="product-showcase-subtitle">
            Every product Crontech ships, in one place — unified billing, one
            dashboard, one type-safe surface from the edge to the database.
          </p>
        </div>

        <div class="product-showcase-grid">
          <For each={items()}>{(product) => <ProductCard {...product} />}</For>
        </div>
      </div>
    </section>
  );
}

export default ProductShowcase;
