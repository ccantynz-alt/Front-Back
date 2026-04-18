// ── AnimatedCounter ──────────────────────────────────────────────────
// Counts up from 0 to `value` once the element scrolls into view. Uses
// requestAnimationFrame with an ease-out curve for a restrained,
// Stripe/Linear-style number roll. Honors prefers-reduced-motion.

import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { usePrefersReducedMotion } from "./reduced-motion";

export interface AnimatedCounterProps {
  readonly value: number;
  readonly prefix?: string;
  readonly suffix?: string;
}

const DURATION_MS = 1500;

// Ease-out cubic — starts fast, settles into the final value. Matches
// the "confident arrival" feel we want on stat cards.
function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

function formatNumber(n: number, target: number): string {
  // Preserve the integer-vs-decimal shape of the target so the counter
  // doesn't flicker between "99.7" and "100" mid-animation.
  if (Number.isInteger(target)) return Math.round(n).toLocaleString();
  return n.toFixed(1);
}

export function AnimatedCounter(props: AnimatedCounterProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = createSignal(0);
  let ref: HTMLSpanElement | undefined;
  let rafId: number | undefined;
  let started = false;

  const runAnimation = (): void => {
    if (started) return;
    started = true;

    if (prefersReducedMotion()) {
      setDisplay(props.value);
      return;
    }

    const start = performance.now();
    const target = props.value;

    const tick = (now: number): void => {
      const t = (now - start) / DURATION_MS;
      if (t >= 1) {
        setDisplay(target);
        rafId = undefined;
        return;
      }
      setDisplay(target * easeOutCubic(t));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  };

  onMount(() => {
    if (!ref) return;
    if (typeof IntersectionObserver === "undefined") {
      runAnimation();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            runAnimation();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(ref);

    onCleanup(() => {
      observer.disconnect();
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    });
  });

  return (
    <span ref={ref}>
      {props.prefix ?? ""}
      {formatNumber(display(), props.value)}
      {props.suffix ?? ""}
    </span>
  );
}
