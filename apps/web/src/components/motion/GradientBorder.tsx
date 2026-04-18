// ── GradientBorder ───────────────────────────────────────────────────
// Wraps children with a restrained animated gradient border. The
// gradient slowly drifts on hover — enough to add depth to a stat or
// feature card without crossing into neon-trail territory.
//
// Uses the CSS `background-clip: border-box / padding-box` trick to
// render the gradient as a 1px ring around a solid inner surface.

import type { JSX } from "solid-js";
import { usePrefersReducedMotion } from "./reduced-motion";

export interface GradientBorderProps {
  /** Gradient start colour. Default: soft white at low opacity. */
  readonly from?: string;
  /** Gradient middle colour. Default: matches `from`. */
  readonly via?: string;
  /** Gradient end colour. Default: soft white at low opacity. */
  readonly to?: string;
  readonly children: JSX.Element;
}

const DEFAULT_FROM = "rgba(255,255,255,0.18)";
const DEFAULT_VIA = "rgba(255,255,255,0.04)";
const DEFAULT_TO = "rgba(255,255,255,0.18)";

export function GradientBorder(props: GradientBorderProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();

  const from = (): string => props.from ?? DEFAULT_FROM;
  const via = (): string => props.via ?? props.from ?? DEFAULT_VIA;
  const to = (): string => props.to ?? DEFAULT_TO;

  const background = (): string =>
    `linear-gradient(var(--color-bg),var(--color-bg)) padding-box, linear-gradient(135deg, ${from()}, ${via()}, ${to()}) border-box`;

  const style = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      position: "relative",
      "border-radius": "1rem",
      border: "1px solid transparent",
      background: background(),
      "background-size": "200% 200%",
      "background-position": "0% 50%",
    };
    if (prefersReducedMotion()) return base;
    return {
      ...base,
      transition: "background-position 1.2s ease",
    };
  };

  // Hover shifts the gradient across the element. On reduced-motion the
  // transition is disabled so the shift is instant (or not visible at all).
  const onEnter = (event: MouseEvent): void => {
    const el = event.currentTarget as HTMLDivElement;
    el.style.backgroundPosition = "100% 50%";
  };
  const onLeave = (event: MouseEvent): void => {
    const el = event.currentTarget as HTMLDivElement;
    el.style.backgroundPosition = "0% 50%";
  };

  return (
    <div style={style()} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {props.children}
    </div>
  );
}
