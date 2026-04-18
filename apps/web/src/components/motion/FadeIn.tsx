// ── FadeIn ───────────────────────────────────────────────────────────
// Simple opacity fade-in on mount. Used for hero text and any content
// that should feel like it settled into place rather than popped.
// Honors prefers-reduced-motion.

import { createSignal, onMount, type JSX } from "solid-js";
import { usePrefersReducedMotion } from "./reduced-motion";

export interface FadeInProps {
  /** Delay before the fade starts, in seconds. Default 0. */
  readonly delay?: number;
  /** Fade duration, in seconds. Default 0.6s. */
  readonly duration?: number;
  readonly children: JSX.Element;
}

export function FadeIn(props: FadeInProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    // Two-frame defer so the browser paints opacity:0 before we
    // switch to opacity:1 — otherwise the transition is skipped.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true));
    });
  });

  const delay = (): number => props.delay ?? 0;
  const duration = (): number => props.duration ?? 0.6;

  const style = (): JSX.CSSProperties => {
    if (prefersReducedMotion()) return { opacity: "1" };
    return {
      opacity: mounted() ? "1" : "0",
      transition: `opacity ${duration()}s ease-out ${delay()}s`,
      "will-change": "opacity",
    };
  };

  return <div style={style()}>{props.children}</div>;
}
