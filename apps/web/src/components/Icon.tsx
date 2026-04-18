import type { JSX } from "solid-js";
import {
  FiCpu,
  FiDatabase,
  FiExternalLink,
  FiLink,
  FiLink2,
  FiLock,
  FiRadio,
  FiShield,
  FiShieldOff,
  FiWifi,
  FiZap,
} from "solid-icons/fi";
import type { IconTypes } from "solid-icons";

// ── Icon Registry ───────────────────────────────────────────────────
//
// Single source of truth for every icon used across the product.
// Consumers reference icons by semantic name, never by import. When
// we swap icon sets (e.g. Feather → full Lucide, or to a custom pack),
// this map is the ONLY place that changes.
//
// Feather Icons are used as the baseline because:
//   1. They are stroke-style at 1.5px, 24x24 — the same visual DNA
//      as Lucide (Lucide is literally a fork of Feather).
//   2. `solid-icons` is `sideEffects: false` — only the icons we
//      reference here ship to the client bundle.
//   3. The set covers our landing-page needs without pulling a
//      second pack.
//
// To add an icon: import it above, add a `"name": Component` line
// to ICON_MAP, and use it via `<Icon name="name" />`.

const ICON_MAP = {
  zap: FiZap,
  bolt: FiZap,
  database: FiDatabase,
  "link-2": FiLink2,
  link: FiLink,
  "external-link": FiExternalLink,
  shield: FiShield,
  "shield-check": FiShield,
  "shield-off": FiShieldOff,
  lock: FiLock,
  radio: FiRadio,
  wifi: FiWifi,
  brain: FiCpu,
  sparkles: FiCpu,
  cpu: FiCpu,
} as const satisfies Record<string, IconTypes>;

export type IconName = keyof typeof ICON_MAP;

export interface IconProps {
  /** Semantic icon name. See ICON_MAP for the full registry. */
  name: IconName;
  /** Pixel size for both width and height. Default: 24. */
  size?: number;
  /** Tailwind / custom classes — colour should come from here. */
  class?: string;
  /** Stroke width. Default: 1.5 (matches Lucide 2026 house style). */
  "stroke-width"?: number;
  /** Optional aria-label; when omitted the icon is marked aria-hidden. */
  "aria-label"?: string;
}

/**
 * Crontech Icon component.
 *
 * Wraps `solid-icons` behind a semantic-name API so the underlying
 * icon library can be swapped without touching call sites.
 *
 * @example
 * <Icon name="zap" size={24} class="text-violet-500" />
 * <Icon name="database" size={20} />
 */
export function Icon(props: IconProps): JSX.Element {
  const Component = ICON_MAP[props.name];
  const size = props.size ?? 24;
  const strokeWidth = props["stroke-width"] ?? 1.5;
  const label = props["aria-label"];

  // solid-icons spreads props onto the root <svg>. We forward size,
  // stroke-width, and accessibility attributes explicitly so every
  // icon in the app renders with consistent stroke weight.
  return (
    <Component
      size={size}
      stroke-width={strokeWidth}
      class={props.class}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
    />
  );
}

export default Icon;
