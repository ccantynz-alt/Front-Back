// ── reduced-motion ──────────────────────────────────────────────────
// Shared helper: honor `prefers-reduced-motion: reduce`.
// WCAG 2.2 AA compliance — motion components must render static
// when the user has set a reduced-motion preference.

import { createSignal, onCleanup, onMount } from "solid-js";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reactive signal that tracks `prefers-reduced-motion`.
 * Updates when the user flips the OS-level preference at runtime.
 */
export function usePrefersReducedMotion(): () => boolean {
  const [reduced, setReduced] = createSignal(false);

  onMount(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const listener = (e: MediaQueryListEvent): void => {
      setReduced(e.matches);
    };
    mql.addEventListener("change", listener);
    onCleanup(() => {
      mql.removeEventListener("change", listener);
    });
  });

  return reduced;
}
