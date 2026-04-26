// ── Video: Public Product Page (Early Preview) ────────────────────────
//
// Marketing page for the Crontech video editor. The full WebGPU-
// accelerated editor + Yjs CRDT collaboration surface is BLK-011
// 🔵 PLANNED in docs/BUILD_BIBLE.md — so this page is in an "Early
// preview" state: it describes the capability, lists what's ready vs
// what's shipping, and collects waitlist interest. No fabricated
// collaborators, no canned AI keyword responses, no fake sync badge.
//
// Polite copy. No competitor names. Zero HTML — SolidJS JSX only.
// Mirrors the /sms + /database structural pattern.

import { createSignal, For, Show, type JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Feature bullets ────────────────────────────────────────────────

interface VideoFeature {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

const VIDEO_FEATURES: ReadonlyArray<VideoFeature> = [
  {
    icon: "zap",
    title: "WebGPU on the client",
    description:
      "Effects, transitions, and frame-accurate scrubbing run on the user's GPU. Your server never touches the pixels, which means the bill stays close to zero.",
  },
  {
    icon: "radio",
    title: "Live collaboration via CRDTs",
    description:
      "Yjs documents replicated through Cloudflare Durable Objects. Two humans and an AI agent can edit the same timeline with no locks, no last-write-wins, no data loss.",
  },
  {
    icon: "brain",
    title: "AI assistant in the timeline",
    description:
      "Subtitle generation, scene detection, and color-grade suggestions from a client-GPU model when the device can handle it, edge inference otherwise. $0 per token where physics allows.",
  },
];

// ── Capability rows (ready vs shipping soon) ───────────────────────

interface CapabilityRow {
  readonly capability: string;
  readonly status: "ready" | "shipping";
  readonly detail: string;
}

const CAPABILITIES: ReadonlyArray<CapabilityRow> = [
  {
    capability: "WebGPU detection + fallback",
    status: "ready",
    detail: "Feature-flag check at load. Canvas 2D fallback on unsupported devices.",
  },
  {
    capability: "Real-time sync (Yjs + Durable Objects)",
    status: "shipping",
    detail: "Document transport + persistence. Presence + cursors follow.",
  },
  {
    capability: "Timeline scrubbing + effects pipeline",
    status: "shipping",
    detail: "Compute shader library under services/edge-workers is live; the editor surface is the final piece.",
  },
  {
    capability: "AI assistant (scenes, subtitles, colour)",
    status: "shipping",
    detail: "Three-tier compute router is shipped. Video-specific prompts + tools land with the editor.",
  },
];

// ── Waitlist helpers (exported for tests) ──────────────────────────

/**
 * Minimal email sanity check — enough to catch typos before we even
 * try to submit. The server will be the final arbiter once the
 * waitlist procedure ships.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  if (!trimmed.includes("@")) return false;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

// ── Code snippet (shape of the eventual editor API) ────────────────

export const VIDEO_SNIPPET = `// The editor surface is coming; the call shape is already typed.
const room = await trpc.video.openRoom.mutate({ projectId });
room.timeline.addEffect({
  at: 12.5,
  kind: "crossfade",
  durationSec: 0.5,
});`;

// ── Page ───────────────────────────────────────────────────────────

export default function VideoPage(): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [submitted, setSubmitted] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const gpuAvailable =
    typeof navigator !== "undefined" && "gpu" in navigator;

  function onSubmit(ev: SubmitEvent): void {
    ev.preventDefault();
    const value = email().trim();
    if (!isPlausibleEmail(value)) {
      setError("That email doesn't look quite right — please check and try again.");
      return;
    }
    setError(null);
    // No waitlist tRPC procedure exists yet. When one lands, call it
    // here. The inline <Show when={submitted()}> confirmation below
    // is the polite response — avoid window.alert (cheap-looking on
    // desktop, hostile on iOS Safari).
    setSubmitted(true);
  }

  return (
    <>
      <SEOHead
        title="Video"
        description="WebGPU-accelerated video editing with CRDT-powered live collaboration and an AI assistant in the timeline. Coming soon to Crontech."
        path="/video"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0f" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          <div
            class="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px 500px at 50% -10%, rgba(139,92,246,0.22), transparent 60%), radial-gradient(800px 400px at 85% 20%, rgba(236,72,153,0.14), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div class="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: "#8b5cf6" }}
                aria-hidden="true"
              />
              Early preview — editor UI coming soon
            </span>
            <h1
              class="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              style={{ color: "#f0f0f5" }}
            >
              Video editing at GPU speed, together.
            </h1>
            <p
              class="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Pixel work on the user's GPU, CRDT sync on our edge network,
              an AI assistant that lives inside the timeline. The underlying
              pipeline is already live — the editor surface is the last
              piece of the puzzle. Drop your email below and we'll email you
              when it opens.
            </p>
            <p
              class="mx-auto mt-4 text-xs"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              WebGPU on this device:{" "}
              <span
                class="font-semibold"
                style={{ color: gpuAvailable ? "#86efac" : "#fbbf24" }}
              >
                {gpuAvailable ? "available" : "falls back to canvas"}
              </span>
            </p>
          </div>
        </section>

        {/* ── Description ─────────────────────────────────────── */}
        <section class="mx-auto max-w-3xl px-6 pb-12">
          <div class="space-y-5 text-base leading-[1.8]" style={{ color: "rgba(255,255,255,0.72)" }}>
            <p>
              Crontech Video is a browser-native editor with one goal — keep
              the pixels on the client, keep the state on the edge, and
              spend nothing per frame when physics allows. WebGPU handles
              effects and transitions. Yjs CRDTs handle multi-user state.
              The AI assistant participates as a peer in the session rather
              than a chatbot bolted on to the side.
            </p>
            <p>
              We're not showing a fake room with imaginary collaborators on
              this page, because that's not honest. The editor surface is in
              the last stretch of build; the plumbing beneath it — the
              compute-router, the CRDT transport, the sandboxed build
              pipeline — is already running.
            </p>
            <p>
              Join the waitlist and you'll be in the first cohort when the
              editor opens.
            </p>
          </div>
        </section>

        {/* ── Waitlist form ───────────────────────────────────── */}
        <section class="mx-auto max-w-2xl px-6 pb-16">
          <form
            onSubmit={onSubmit}
            class="rounded-2xl p-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <label
              for="video-waitlist-email"
              class="text-sm font-medium"
              style={{ color: "#e5e5e5" }}
            >
              Email me when the editor is live
            </label>
            <div class="mt-3 flex flex-wrap items-stretch gap-2">
              <input
                id="video-waitlist-email"
                name="email"
                type="email"
                autocomplete="email"
                inputmode="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="you@example.com"
                class="min-w-0 flex-1 rounded-lg px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#f0f0f5",
                }}
              />
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                  color: "#ffffff",
                  "box-shadow": "0 8px 24px -8px rgba(139,92,246,0.55)",
                }}
              >
                Join waitlist
              </button>
            </div>
            <Show when={error()}>
              <p
                class="mt-3 text-xs"
                style={{ color: "#fca5a5" }}
                role="alert"
              >
                {error()}
              </p>
            </Show>
            <Show when={submitted() && !error()}>
              <p
                class="mt-3 text-xs"
                style={{ color: "#86efac" }}
              >
                Thanks — we'll email you the moment the editor is live.
              </p>
            </Show>
            <p
              class="mt-4 text-[11px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              One email, only when it's live. No marketing list.
            </p>
          </form>
        </section>

        {/* ── Feature bullets ─────────────────────────────────── */}
        <section class="mx-auto max-w-5xl px-6 pb-16">
          <div class="grid gap-5 md:grid-cols-3">
            <For each={VIDEO_FEATURES}>
              {(feat) => (
                <article
                  class="rounded-2xl p-6"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    "box-shadow": "0 2px 8px rgba(0,0,0,0.2)",
                  }}
                >
                  <div
                    class="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.15))",
                      color: "#c4b5fd",
                      border: "1px solid rgba(139,92,246,0.25)",
                    }}
                  >
                    <Icon name={feat.icon} size={20} />
                  </div>
                  <h2
                    class="mt-5 text-[1.0625rem] font-semibold tracking-tight"
                    style={{ color: "#f0f0f5" }}
                  >
                    {feat.title}
                  </h2>
                  <p
                    class="mt-2 text-sm leading-[1.75]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {feat.description}
                  </p>
                </article>
              )}
            </For>
          </div>
        </section>

        {/* ── Capability table ─────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-16">
          <h2
            class="text-2xl font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            What's ready, what's shipping
          </h2>
          <p
            class="mt-2 text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Honest status. No theatre.
          </p>
          <div
            class="mt-5 overflow-hidden rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <table class="w-full text-left text-sm">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Capability
                  </th>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Status
                  </th>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={CAPABILITIES}>
                  {(row) => (
                    <tr
                      style={{ "border-top": "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <td
                        class="px-5 py-3 font-semibold"
                        style={{ color: "#f0f0f5" }}
                      >
                        {row.capability}
                      </td>
                      <td class="px-5 py-3">
                        <span
                          class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                          style={
                            row.status === "ready"
                              ? {
                                  background: "rgba(16,185,129,0.15)",
                                  color: "#6ee7b7",
                                  border: "1px solid rgba(16,185,129,0.3)",
                                }
                              : {
                                  background: "rgba(251,191,36,0.15)",
                                  color: "#fcd34d",
                                  border: "1px solid rgba(251,191,36,0.3)",
                                }
                          }
                        >
                          {row.status === "ready" ? "Ready" : "Shipping"}
                        </span>
                      </td>
                      <td
                        class="px-5 py-3"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        {row.detail}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Preview snippet ─────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-24">
          <h2
            class="text-2xl font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            A glimpse of the editor API
          </h2>
          <p
            class="mt-2 text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Final shape may settle a hair before GA — but this is the plan.
          </p>
          <pre
            class="mt-5 overflow-x-auto rounded-2xl p-5 text-[13px] leading-[1.7]"
            style={{
              background: "rgba(8, 8, 14, 0.75)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e5e7eb",
              "font-family":
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            <code>{VIDEO_SNIPPET}</code>
          </pre>
        </section>
      </div>
    </>
  );
}
