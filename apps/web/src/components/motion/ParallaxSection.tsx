// ── ParallaxSection ──────────────────────────────────────────────────
// Wraps a section and applies a subtle Y-translate as the user scrolls
// past it. Disabled on reduced-motion and on narrow viewports (mobile),
// where parallax tends to feel more like seasickness than premium.

import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { usePrefersReducedMotion } from "./reduced-motion";

export interface ParallaxSectionProps {
  /** Maximum Y offset (px) applied across the scroll window. Default 30. */
  readonly offset?: number;
  readonly children: JSX.Element;
}

const MOBILE_BREAKPOINT = 768;

export function ParallaxSection(props: ParallaxSectionProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [translate, setTranslate] = createSignal(0);
  let ref: HTMLDivElement | undefined;
  let rafPending = false;

  const offset = (): number => props.offset ?? 30;

  onMount(() => {
    if (!ref) return;
    if (typeof window === "undefined") return;
    if (prefersReducedMotion()) return;
    if (window.innerWidth < MOBILE_BREAKPOINT) return;

    const update = (): void => {
      rafPending = false;
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      const viewport = window.innerHeight;
      // -1 (section below the viewport) .. 0 (centred) .. 1 (above viewport)
      const progress =
        (rect.top + rect.height / 2 - viewport / 2) / (viewport / 2 + rect.height / 2);
      const clamped = Math.min(1, Math.max(-1, progress));
      setTranslate(-clamped * offset());
    };

    const onScroll = (): void => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    onCleanup(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    });
  });

  const style = (): JSX.CSSProperties => {
    if (prefersReducedMotion()) return {};
    return {
      transform: `translate3d(0, ${translate()}px, 0)`,
      "will-change": "transform",
    };
  };

  return (
    <div ref={ref} style={style()}>
      {props.children}
    </div>
  );
}
