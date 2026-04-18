// Cloudflare Workers mark — stylized placeholder
//
// An abstract cloud silhouette in the brand orange (#f38020). We do not
// reproduce the official Cloudflare mark; this is a generic rounded-cloud
// shape in the brand color.
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";
import type { LogoProps } from "./SolidLogo";

export function CloudflareLogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="Cloudflare Workers"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>Cloudflare Workers</title>
      <defs>
        <linearGradient id="cf-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#faad3f" />
          <stop offset="100%" stop-color="#f38020" />
        </linearGradient>
      </defs>
      <path
        d="M18.5 17H7a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.2a3.9 3.9 0 0 1 .5 7.8z"
        fill="url(#cf-grad)"
      />
      <path
        d="M7.5 17l4-8.2h1.2L8.5 17H7.5zm4 0l4-8.2h1.2L12.5 17h-1z"
        fill="#ffffff"
        opacity="0.4"
      />
    </svg>
  );
}
