// BLK-018 Voice-1 — VoicePill
//
// Floating bottom-right push-to-talk pill. Uses the browser-native
// WebSpeech API for STT (free, on-device on Chrome/Edge/Safari iOS 14.5+)
// and hands the transcript to the caller via `onTranscript`. The pill
// hides itself if the browser does not support SpeechRecognition —
// this is a polish component, not a core feature, and we refuse to
// render a dead button.
//
// States: idle → listening → processing → idle/error. The ring pulses
// while listening; the pill turns red on error with a one-line message.

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";

// ── WebSpeech typings (not in lib.dom for all TS versions) ────────

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  onstart: ((ev: Event) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Component ─────────────────────────────────────────────────────

export type VoicePillStatus =
  | "idle"
  | "unsupported"
  | "listening"
  | "processing"
  | "error";

export interface VoicePillProps {
  /** Called with the final transcript once speech ends. */
  readonly onTranscript: (transcript: string) => Promise<void> | void;
  /** Called when the pill's status changes — for parent UI sync. */
  readonly onStatusChange?: (status: VoicePillStatus) => void;
  /** BCP-47 language tag. Defaults to en-US. */
  readonly lang?: string;
  /** Hide the pill entirely. */
  readonly hidden?: boolean;
}

export function VoicePill(props: VoicePillProps): JSX.Element {
  const [status, setStatus] = createSignal<VoicePillStatus>("idle");
  const [interim, setInterim] = createSignal<string>("");
  const [error, setError] = createSignal<string | null>(null);
  let recognizer: SpeechRecognitionInstance | null = null;
  let finalTranscript = "";

  function updateStatus(next: VoicePillStatus): void {
    setStatus(next);
    props.onStatusChange?.(next);
  }

  onMount(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      updateStatus("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = props.lang ?? "en-US";

    rec.onstart = () => {
      finalTranscript = "";
      setInterim("");
      setError(null);
      updateStatus("listening");
    };

    rec.onresult = (ev) => {
      let interimPart = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r) continue;
        const alt = r[0];
        if (!alt) continue;
        if (r.isFinal) {
          finalTranscript += alt.transcript;
        } else {
          interimPart += alt.transcript;
        }
      }
      setInterim(interimPart);
    };

    rec.onerror = (ev) => {
      setError(ev.error || "speech error");
      updateStatus("error");
    };

    rec.onend = () => {
      const text = finalTranscript.trim();
      if (!text) {
        if (status() !== "error") updateStatus("idle");
        return;
      }
      updateStatus("processing");
      Promise.resolve(props.onTranscript(text))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "dispatch failed");
          updateStatus("error");
        })
        .then(() => {
          if (status() !== "error") updateStatus("idle");
        });
    };

    recognizer = rec;
  });

  onCleanup(() => {
    try {
      recognizer?.abort();
    } catch {
      /* ignore */
    }
  });

  function toggle(): void {
    if (!recognizer) return;
    if (status() === "listening") {
      try {
        recognizer.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    if (status() === "processing") return;
    try {
      recognizer.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not start mic");
      updateStatus("error");
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  const ringColor = (): string => {
    switch (status()) {
      case "listening":
        return "var(--color-danger)";
      case "processing":
        return "var(--color-warning)";
      case "error":
        return "var(--color-danger)";
      default:
        return "var(--color-primary)";
    }
  };

  const label = (): string => {
    switch (status()) {
      case "listening":
        return "Listening… tap to stop";
      case "processing":
        return "Dispatching…";
      case "error":
        return error() ?? "Error";
      default:
        return "Tap to speak";
    }
  };

  return (
    <Show when={!props.hidden && status() !== "unsupported"}>
      <div
        style={{
          position: "fixed",
          right: "1.25rem",
          bottom: "1.25rem",
          "z-index": 9999,
          display: "flex",
          "align-items": "center",
          gap: "0.6rem",
          "pointer-events": "none",
        }}
      >
        <Show when={status() === "listening" && interim().trim().length > 0}>
          <div
            style={{
              background: "rgba(15,15,17,0.92)",
              border: "1px solid #27272a",
              "border-radius": "999px",
              padding: "0.5rem 0.9rem",
              "font-size": "0.8rem",
              color: "#e4e4e7",
              "max-width": "360px",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
              "pointer-events": "auto",
            }}
          >
            {interim()}
          </div>
        </Show>

        <button
          type="button"
          aria-label={label()}
          title={label()}
          onClick={toggle}
          style={{
            "pointer-events": "auto",
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            width: "56px",
            height: "56px",
            "border-radius": "50%",
            border: `2px solid ${ringColor()}`,
            background:
              status() === "listening"
                ? "rgba(239,68,68,0.12)"
                : "rgba(15,15,17,0.92)",
            color: ringColor(),
            cursor: status() === "processing" ? "wait" : "pointer",
            "box-shadow":
              status() === "listening"
                ? `0 0 0 6px rgba(239,68,68,0.18), 0 8px 24px rgba(0,0,0,0.4)`
                : "0 8px 24px rgba(0,0,0,0.4)",
            transition: "box-shadow 150ms ease, background 150ms ease",
          }}
        >
          <Show
            when={status() !== "processing"}
            fallback={
              <span
                style={{
                  width: "14px",
                  height: "14px",
                  "border-radius": "50%",
                  border: `2px solid ${ringColor()}`,
                  "border-top-color": "transparent",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            }
          >
            {/* mic glyph */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </Show>
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Show>
  );
}
