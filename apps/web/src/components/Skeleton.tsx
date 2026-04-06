import type { JSX } from "solid-js";

interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  class?: string;
}

/**
 * Shimmer skeleton placeholder for loading states.
 * Uses the `.skeleton` utility defined in app.css.
 */
export function Skeleton(props: SkeletonProps): JSX.Element {
  return (
    <div
      class={`skeleton ${props.class ?? ""}`}
      style={{
        width: props.width ?? "100%",
        height: props.height ?? "1rem",
        "border-radius": props.radius ?? "0.5rem",
      }}
      aria-hidden="true"
    />
  );
}

/** Pre-composed card skeleton for grid loading states. */
export function SkeletonCard(): JSX.Element {
  return (
    <div class="skeleton-card">
      <Skeleton height="1.25rem" width="40%" />
      <Skeleton height="1rem" width="90%" />
      <Skeleton height="1rem" width="75%" />
      <Skeleton height="2rem" width="8rem" radius="0.5rem" />
    </div>
  );
}
