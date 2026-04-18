// ── HelpBubble ──────────────────────────────────────────────────────
// Tiny "?" icon that shows a plain-English tip on click/hover.

import { Show, createSignal } from "solid-js";

interface HelpBubbleProps {
  readonly title?: string;
  readonly text: string;
  readonly docsHref?: string;
  readonly videoHref?: string;
}

export function HelpBubble(props: HelpBubbleProps): ReturnType<typeof Show> {
  const [open, setOpen] = createSignal(false);

  return (
    <Show when={true}>
      <span
        style={{ position: "relative", display: "inline-block" }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          aria-label="Help"
          onClick={() => setOpen(!open())}
          style={{
            width: "18px",
            height: "18px",
            "border-radius": "9999px",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-elevated)",
            color: "var(--color-primary)",
            "font-size": "12px",
            "font-weight": "700",
            cursor: "pointer",
            "line-height": "1",
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
          }}
        >
          ?
        </button>
        <Show when={open()}>
          <div
            style={{
              position: "absolute",
              top: "24px",
              left: "0",
              "z-index": "5000",
              width: "240px",
              background: "var(--color-bg-elevated)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              "border-radius": "8px",
              padding: "0.625rem 0.75rem",
              "box-shadow": "0 8px 24px rgba(0,0,0,0.15)",
              "font-size": "13px",
              "line-height": "1.45",
              "font-family": "system-ui, -apple-system, sans-serif",
            }}
          >
            <Show when={props.title}>
              <div style={{ "font-weight": "600", "margin-bottom": "0.25rem" }}>{props.title}</div>
            </Show>
            <div style={{ color: "var(--color-text-secondary)" }}>{props.text}</div>
            <Show when={props.docsHref || props.videoHref}>
              <div
                style={{
                  "margin-top": "0.5rem",
                  display: "flex",
                  gap: "0.75rem",
                  "font-size": "12px",
                }}
              >
                <Show when={props.docsHref}>
                  <a href={props.docsHref} style={{ color: "var(--color-primary)" }}>
                    Read more
                  </a>
                </Show>
                <Show when={props.videoHref}>
                  <a href={props.videoHref} style={{ color: "var(--color-primary)" }}>
                    Watch video
                  </a>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </span>
    </Show>
  );
}

export default HelpBubble;
