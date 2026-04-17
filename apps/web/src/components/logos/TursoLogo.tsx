// Turso mark — stylized placeholder
//
// A stacked-disks silhouette (database motif) in the Turso violet
// (#4ff8d2 accent is the Turso teal; the brand also uses a violet). We
// pair a violet base with a teal accent to nod at the brand palette
// without reproducing the official wordmark/mark.
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";
import type { LogoProps } from "./SolidLogo";

export function TursoLogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="Turso"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>Turso</title>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" fill="#7c3aed" />
      <path d="M5 6v5c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5V6" fill="#6d28d9" />
      <path d="M5 11v5c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5v-5" fill="#5b21b6" />
      <ellipse cx="12" cy="16" rx="7" ry="2.5" fill="none" stroke="#4ff8d2" stroke-width="0.8" opacity="0.9" />
    </svg>
  );
}
