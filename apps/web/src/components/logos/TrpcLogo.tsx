// tRPC mark — stylized placeholder
//
// A rounded-square badge in the brand blue with a lowercase "t" monogram.
// We do not reproduce the official tRPC lettermark; this is an abstract
// badge in the brand color (#398ccb).
//
// Natural size ~24px. Accessible via inline <title>.

import type { JSX } from "solid-js";
import type { LogoProps } from "./SolidLogo";

export function TrpcLogo(props: LogoProps): JSX.Element {
  const size = (): number => props.size ?? 24;
  return (
    <svg
      role="img"
      aria-label="tRPC"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <title>tRPC</title>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#398ccb" />
      <path
        d="M9.5 8h5M12 8v8M10.5 16h3"
        stroke="#ffffff"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  );
}
