// SolidJS mark — stylized placeholder
//
// SolidJS has an official SVG logo (three concentric arcs in blue). Rather
// than reproduce the registered mark, we render an abstract "S" glyph in a
// rounded square using the SolidJS brand blues (#2C4F7C deep / #446B9E mid
// / #66AADD accent).
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";

/**
 * Shared props for every brand logo component in this directory.
 *
 * All logos are square, driven by a single `size` (px), and may receive
 * an optional `class` for Tailwind hover/color modulation from the
 * parent.
 */
export interface LogoProps {
  /** Square pixel size. Default 24. */
  readonly size?: number;
  /** Optional class list applied to the root <svg>. */
  readonly class?: string;
}

export function SolidLogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="SolidJS"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>SolidJS</title>
      <defs>
        <linearGradient id="solid-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#66aadd" />
          <stop offset="60%" stop-color="#446b9e" />
          <stop offset="100%" stop-color="#2c4f7c" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#solid-grad)" />
      <path
        d="M16 9.2c-.8-1-2.2-1.6-4-1.6-2.3 0-3.9 1.1-3.9 2.7 0 1.5 1.2 2.2 3.3 2.6l1.1.2c1.1.2 1.6.5 1.6 1.1 0 .8-.8 1.2-2 1.2-1.3 0-2.2-.4-2.8-1.2l-1.6 1.1c.9 1.3 2.5 2 4.4 2 2.4 0 4.1-1.1 4.1-2.8 0-1.5-1.1-2.3-3.2-2.7l-1.2-.2c-1.1-.2-1.6-.5-1.6-1 0-.7.7-1.1 1.9-1.1 1.1 0 2 .4 2.6 1.1z"
        fill="#ffffff"
        opacity="0.95"
      />
    </svg>
  );
}
