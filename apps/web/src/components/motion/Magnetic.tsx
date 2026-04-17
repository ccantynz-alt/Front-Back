// ── Magnetic ─────────────────────────────────────────────────────────
// Wrapper for a button or link that subtly pulls toward the cursor on
// hover. Implemented with a pure CSS `transform` driven from a signal —
// no layout thrash, no reflow. Honors prefers-reduced-motion by rendering
// a completely static wrapper.

import { createSignal, onCleanup, type JSX } from "solid-js";
import { usePrefersReducedMotion } from "./reduced-motion";

export interface MagneticProps {
  /**
   * How strongly the wrapper follows the cursor. 0 = no movement,
   * 1 = moves the full distance from centre to edge. Default 0.3.
   */
  readonly strength?: number;
  readonly children: JSX.Element;
}

export function Magnetic(props: MagneticProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [dx, setDx] = createSignal(0);
  const [dy, setDy] = createSignal(0);
  let ref: HTMLSpanElement | undefined;
  let rafId: number | undefined;

  const strength = (): number => props.strength ?? 0.3;

  const onMove = (event: MouseEvent): void => {
    if (prefersReducedMotion() || !ref) return;
    const rect = ref.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const nextX = (event.clientX - cx) * strength();
    const nextY = (event.clientY - cy) * strength();

    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      setDx(nextX);
      setDy(nextY);
    });
  };

  const onLeave = (): void => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      setDx(0);
      setDy(0);
    });
  };

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
  });

  const style = (): JSX.CSSProperties => {
    if (prefersReducedMotion()) return { display: "inline-block" };
    return {
      display: "inline-block",
      transform: `translate3d(${dx()}px, ${dy()}px, 0)`,
      transition: "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
      "will-change": "transform",
    };
  };

  return (
    <span ref={ref} style={style()} onMouseMove={onMove} onMouseLeave={onLeave}>
      {props.children}
    </span>
  );
}
