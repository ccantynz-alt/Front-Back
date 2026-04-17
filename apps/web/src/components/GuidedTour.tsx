// ── GuidedTour ──────────────────────────────────────────────────────
// Interactive overlay tour with highlighted steps.

import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { TOUR_REGISTRY, type TourStep, markTourSeen } from "../lib/tours";

interface GuidedTourProps {
  readonly tourName: string;
  readonly autoStart?: boolean;
  readonly onComplete?: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const FALLBACK_RECT: Rect = { top: 100, left: 100, width: 200, height: 60 };

export function GuidedTour(props: GuidedTourProps): ReturnType<typeof Show> {
  const steps = (): ReadonlyArray<TourStep> => TOUR_REGISTRY[props.tourName] ?? [];
  const [active, setActive] = createSignal(props.autoStart ?? false);
  const [index, setIndex] = createSignal(0);
  const [rect, setRect] = createSignal<Rect>(FALLBACK_RECT);
  const [paused, setPaused] = createSignal(false);

  function measure(): void {
    if (typeof document === "undefined") return;
    const step = steps()[index()];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el && "getBoundingClientRect" in el) {
      const r = (el as Element).getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(FALLBACK_RECT);
    }
  }

  onMount(() => {
    if (typeof window === "undefined") return;
    const handler = (): void => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    onCleanup(() => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    });
  });

  createEffect(() => {
    if (active()) {
      void index();
      window.setTimeout(measure, 50);
    }
  });

  function next(): void {
    if (index() >= steps().length - 1) {
      finish();
    } else {
      setIndex(index() + 1);
    }
  }

  function prev(): void {
    if (index() > 0) setIndex(index() - 1);
  }

  function finish(): void {
    setActive(false);
    setIndex(0);
    markTourSeen(props.tourName);
    props.onComplete?.();
  }

  function skip(): void {
    finish();
  }

  // public API on the element via ref/context not used; export start function via window
  if (typeof window !== "undefined") {
    const w = window as unknown as { __btfTours?: Record<string, () => void> };
    w.__btfTours = w.__btfTours ?? {};
    w.__btfTours[props.tourName] = (): void => {
      setIndex(0);
      setActive(true);
    };
  }

  return (
    <Show when={active() && steps().length > 0}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": "10000",
          "pointer-events": paused() ? "none" : "auto",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          style={{
            position: "absolute",
            inset: "0",
            background: "rgba(0,0,0,0.5)",
          }}
          onClick={skip}
        />
        <div
          style={{
            position: "absolute",
            top: `${rect().top - 6}px`,
            left: `${rect().left - 6}px`,
            width: `${rect().width + 12}px`,
            height: `${rect().height + 12}px`,
            "border-radius": "10px",
            border: "3px solid var(--color-primary)",
            "box-shadow": "0 0 0 9999px rgba(0,0,0,0.5), 0 0 24px rgba(99,102,241,0.6)",
            "pointer-events": "none",
            animation: "btf-pulse 1.6s ease-in-out infinite",
            transition: "all 0.3s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: `${Math.min(rect().top + rect().height + 16, window.innerHeight - 200)}px`,
            left: `${Math.max(16, Math.min(rect().left, window.innerWidth - 340))}px`,
            width: "320px",
            background: "var(--color-bg-elevated)",
            color: "var(--color-text)",
            "border-radius": "12px",
            padding: "1rem",
            "box-shadow": "0 16px 48px rgba(0,0,0,0.3)",
            "font-family": "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ "font-size": "12px", color: "var(--color-primary)", "font-weight": "600" }}>
            Step {index() + 1} of {steps().length}
          </div>
          <div
            style={{
              "font-size": "16px",
              "font-weight": "700",
              "margin-top": "0.25rem",
            }}
          >
            {steps()[index()]?.title}
          </div>
          <div
            style={{
              "font-size": "14px",
              color: "var(--color-text-secondary)",
              "margin-top": "0.5rem",
              "line-height": "1.5",
            }}
          >
            {steps()[index()]?.content}
          </div>
          <div
            style={{
              display: "flex",
              "justify-content": "space-between",
              "align-items": "center",
              "margin-top": "1rem",
              gap: "0.5rem",
            }}
          >
            <button
              type="button"
              onClick={skip}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                "font-size": "13px",
              }}
            >
              Skip tour
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Show when={index() > 0}>
                <button
                  type="button"
                  onClick={prev}
                  style={{
                    padding: "0.4rem 0.75rem",
                    "border-radius": "6px",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-elevated)",
                    cursor: "pointer",
                    "font-size": "13px",
                  }}
                >
                  Back
                </button>
              </Show>
              <button
                type="button"
                onClick={next}
                style={{
                  padding: "0.4rem 0.875rem",
                  "border-radius": "6px",
                  border: "none",
                  background: "var(--color-primary)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  "font-size": "13px",
                  "font-weight": "600",
                }}
              >
                {index() >= steps().length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
        <style>{`@keyframes btf-pulse { 0%,100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 24px rgba(99,102,241,0.6);} 50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 36px rgba(99,102,241,0.95);} }`}</style>
      </div>
    </Show>
  );
}

export default GuidedTour;
