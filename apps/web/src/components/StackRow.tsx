// ── StackRow ─────────────────────────────────────────────────────────
// A horizontal row of the technologies powering Crontech, each shown as
// a logo-plus-name badge with subtle dot separators between them.
//
// Replaces the amateur uppercase gray "SOLIDJS BUN HONO ..." text row
// that used to live on the landing page. Each item:
//   - has a hand-crafted SVG mark (see ./logos/*.tsx) in brand color
//   - has proper typography (not uppercase, not gray)
//   - is clickable to the tech's homepage (opens in new tab, noopener)
//   - pulses its logo slightly on hover (no dramatic motion)
//
// The component is self-contained and presentational. The landing page
// will mount <StackRow /> wherever it wants the badges to appear.
//
// Tone note: per docs/POSITIONING.md, attribution to the underlying
// stack is allowed — these are the tools we build on, not competitors.

import { For, type JSX } from "solid-js";
import { BunLogo } from "./logos/BunLogo";
import { CloudflareLogo } from "./logos/CloudflareLogo";
import { HonoLogo } from "./logos/HonoLogo";
import type { LogoProps } from "./logos/SolidLogo";
import { SolidLogo } from "./logos/SolidLogo";
import { TrpcLogo } from "./logos/TrpcLogo";
import { TursoLogo } from "./logos/TursoLogo";
import { WebGPULogo } from "./logos/WebGPULogo";

// ── Types ────────────────────────────────────────────────────────────

interface StackItem {
  readonly name: string;
  readonly href: string;
  readonly Logo: (props: LogoProps) => JSX.Element;
}

// ── Stack manifest ───────────────────────────────────────────────────
// Order is deliberate: runtime → framework → API → infra → data → GPU.

const STACK: readonly StackItem[] = [
  { name: "SolidJS", href: "https://www.solidjs.com", Logo: SolidLogo },
  { name: "Bun", href: "https://bun.sh", Logo: BunLogo },
  { name: "Hono", href: "https://hono.dev", Logo: HonoLogo },
  { name: "tRPC", href: "https://trpc.io", Logo: TrpcLogo },
  {
    name: "Cloudflare Workers",
    href: "https://workers.cloudflare.com",
    Logo: CloudflareLogo,
  },
  { name: "Turso", href: "https://turso.tech", Logo: TursoLogo },
  { name: "WebGPU", href: "https://www.w3.org/TR/webgpu/", Logo: WebGPULogo },
] as const;

// ── Component ────────────────────────────────────────────────────────

export interface StackRowProps {
  /** Optional extra classes on the outer <nav>. */
  readonly class?: string;
}

export function StackRow(props: StackRowProps): JSX.Element {
  return (
    <nav
      aria-label="Built on"
      class={`flex w-full items-center justify-center py-6 ${props.class ?? ""}`}
    >
      <ul class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <For each={STACK}>
          {(item, index) => (
            <>
              <li class="flex items-center">
                <StackBadge item={item} />
              </li>
              {index() < STACK.length - 1 && (
                <li
                  aria-hidden="true"
                  class="select-none text-gray-600 text-xs leading-none"
                >
                  {"\u00B7"}
                </li>
              )}
            </>
          )}
        </For>
      </ul>
    </nav>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

interface StackBadgeProps {
  readonly item: StackItem;
}

/**
 * One logo + name pair. Renders as an `<a>` opening the tech's homepage
 * in a new tab with `rel="noreferrer noopener"` per the spec.
 */
function StackBadge(inputProps: StackBadgeProps): JSX.Element {
  const { item } = inputProps;
  const Logo = item.Logo;
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer noopener"
      class="group inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-gray-200 leading-none no-underline transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      title={item.name}
    >
      <span class="inline-flex h-5 w-5 items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
        <Logo size={20} />
      </span>
      <span class="whitespace-nowrap font-medium tracking-tight">
        {item.name}
      </span>
    </a>
  );
}

// ── Exports for tests ────────────────────────────────────────────────

export const __STACK_ITEMS_FOR_TEST: readonly StackItem[] = STACK;
