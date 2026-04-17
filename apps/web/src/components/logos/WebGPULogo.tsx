// WebGPU mark — stylized placeholder
//
// WebGPU is a W3C standard and its published mark is a rounded cube in
// turquoise. We use an abstract cube silhouette in the brand turquoise
// (#18a0a0) rather than reproducing the official W3C mark.
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";
import type { LogoProps } from "./SolidLogo";

export function WebGPULogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="WebGPU"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>WebGPU</title>
      <g fill="none" stroke="#18a0a0" stroke-width="1.6" stroke-linejoin="round">
        {/* Isometric cube silhouette */}
        <path d="M12 3L4 7v10l8 4 8-4V7z" fill="#18a0a0" fill-opacity="0.12" />
        <path d="M4 7l8 4 8-4" />
        <path d="M12 11v10" />
      </g>
      <circle cx="12" cy="11" r="1.4" fill="#18a0a0" />
    </svg>
  );
}
