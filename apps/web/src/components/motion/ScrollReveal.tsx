// ── ScrollReveal ────────────────────────────────────────────────────
// Wraps children; fades + slides up when the element scrolls into the
// viewport. Uses IntersectionObserver. Motion-restrained: one short
// transition, no bounce, no neon. Honors prefers-reduced-motion.

import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { usePrefersReducedMotion } from "./reduced-motion";

export interface ScrollRevealProps {
  /** Delay before the reveal starts, in seconds. Default 0. */
  readonly delay?: number;
  /** Distance to slide up from, in px. Default 20. */
  readonly distance?: number;
  /** When true, only reveal once; stay visible thereafter. Default true. */
  readonly once?: boolean;
  readonly children: JSX.Element;
}

export function ScrollReveal(props: ScrollRevealProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = createSignal(false);
  let ref: HTMLDivElement | undefined;

  const distance = (): number => props.distance ?? 20;
  const delay = (): number => props.delay ?? 0;
  const once = (): boolean => props.once ?? true;

  onMount(() => {
    if (!ref || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once()) observer.disconnect();
          } else if (!once()) {
            setVisible(false);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(ref);
    onCleanup(() => observer.disconnect());
  });

  // Reduced motion: render at resting state, no transform/opacity tween.
  const style = (): JSX.CSSProperties => {
    if (prefersReducedMotion()) {
      return { opacity: "1", transform: "none" };
    }
    const shown = visible();
    return {
      opacity: shown ? "1" : "0",
      transform: shown ? "translate3d(0, 0, 0)" : `translate3d(0, ${distance()}px, 0)`,
      transition: `opacity 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delay()}s, transform 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delay()}s`,
      "will-change": "opacity, transform",
    };
  };

  return (
    <div ref={ref} style={style()}>
      {props.children}
    </div>
  );
}
