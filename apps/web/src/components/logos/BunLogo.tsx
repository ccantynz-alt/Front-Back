// Bun mark — stylized placeholder
//
// Bun's mascot is a cream/beige bun silhouette. We render an abstract
// rounded dome (the "bun" shape) in the Bun cream (#f6dece) with a
// subtle ink outline, rather than reproducing the official mascot.
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";
import type { LogoProps } from "./SolidLogo";

export function BunLogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="Bun"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>Bun</title>
      {/* Bun dome */}
      <path
        d="M3 13.5c0-4.7 4-7.5 9-7.5s9 2.8 9 7.5c0 2.8-2 4.5-4 4.5H7c-2 0-4-1.7-4-4.5z"
        fill="#f6dece"
        stroke="#1a1a1a"
        stroke-width="1"
      />
      {/* Base plate */}
      <rect x="3" y="17" width="18" height="1.5" rx="0.75" fill="#1a1a1a" opacity="0.85" />
      {/* Eye sparkles */}
      <circle cx="9" cy="12" r="0.8" fill="#1a1a1a" />
      <circle cx="15" cy="12" r="0.8" fill="#1a1a1a" />
      {/* Cheek blush */}
      <ellipse cx="7.5" cy="14" rx="1.1" ry="0.55" fill="#f0a6a0" opacity="0.6" />
      <ellipse cx="16.5" cy="14" rx="1.1" ry="0.55" fill="#f0a6a0" opacity="0.6" />
      {/* Smile */}
      <path
        d="M10.8 14.2c.4.4 1.3.4 1.7 0"
        fill="none"
        stroke="#1a1a1a"
        stroke-width="0.9"
        stroke-linecap="round"
      />
    </svg>
  );
}
