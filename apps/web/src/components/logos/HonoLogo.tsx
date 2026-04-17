// Hono mark — stylized placeholder
//
// Hono means "flame" in Japanese. We use an abstract flame shape in the
// brand orange gradient rather than attempting to reproduce the official
// Hono mark.
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";
import type { LogoProps } from "./SolidLogo";

export function HonoLogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="Hono"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>Hono</title>
      <defs>
        <linearGradient id="hono-flame" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#ff8a1f" />
          <stop offset="100%" stop-color="#e7472c" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5c1.2 3.2 4.5 5 4.5 9.5 0 4-3 7.5-4.5 9.5-1.5-2-4.5-5.5-4.5-9.5 0-2.2 1.2-3.8 2.2-5.2.9-1.3 1.6-2.6 2.3-4.3z"
        fill="url(#hono-flame)"
      />
      <path
        d="M12 9c.5 1.4 2 2.4 2 4.3s-1 3.2-2 4.2c-1-1-2-2.3-2-4.2 0-1.4.7-2.4 1.3-3.4.3-.4.5-.6.7-.9z"
        fill="#ffd08a"
        opacity="0.85"
      />
    </svg>
  );
}
