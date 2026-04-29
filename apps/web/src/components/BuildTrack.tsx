// ── BuildTrack — Live Build Progress HUD ────────────────────────────
// A persistent, fixed-position overlay that shows Craig where the
// Crontech build is at, on every page, at every moment, without
// having to open a chat window or scroll a doc.
//
// Why this exists (authorised by Craig on 15 Apr 2026):
//   "let's make it a live track. It always stays on the screen
//    and just moves with the screen."
//
// Contents:
//   - Collapsed pill: "N / M shipped • SHA xxxxx" with drift dot.
//   - Expanded panel: all Build Bible blocks + deploy health + the
//     proposed blocks for the Crontech Independence migration.
//   - Live version probe: polls /api/version every 60s, compares to
//     the SHA baked into the client bundle at build time, and surfaces
//     deploy drift as a red dot + tooltip. This is EXACTLY the
//     condition that made "the website is the same as yesterday"
//     invisible until now.
//
// Gating:
//   - Shown automatically to admin users (user.role === "admin").
//   - Also shown when localStorage["btf:buildtrack:force"] === "true"
//     (dev toggle so Craig can see it signed out during demos).
//   - Hidden otherwise so customers never see internal state.
//
// Position: fixed bottom-left. VoicePill sits bottom-right so the two
// HUDs do not fight for the same corner.

import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { JSX } from "solid-js";
import { useAuth } from "../stores";

// ── Block catalogue ──────────────────────────────────────────────────
// Hand-curated snapshot of docs/BUILD_BIBLE.md (BLK-001..016) plus the
// three blocks that shipped in PR #88 without Bible entries, plus the
// four proposed blocks that came out of the 15 Apr planning session.
// The HUD is the source of truth for "where are we" until the Bible
// is amended to close the gap; it does not replace the Bible.

export type BlockStatus =
  | "shipped" // ✅ merged, live, locked
  | "set" // 🟢 locked doctrine, no code to ship
  | "building" // 🟡 actively in motion this sprint
  | "planned" // 🔵 scoped, not started
  | "paused" // ⚫ started, on hold
  | "undocumented" // ⚠️ code shipped, Bible entry missing
  | "proposed"; // 🟡 PROPOSED, awaiting Craig's green light

export interface BlockEntry {
  readonly id: string;
  readonly title: string;
  readonly status: BlockStatus;
  readonly note?: string;
}

// Keep this list ordered by block ID. New blocks append at the bottom.
export const BUILD_TRACK_BLOCKS: readonly BlockEntry[] = [
  { id: "BLK-001", title: "Positioning (locked copy)", status: "shipped" },
  { id: "BLK-002", title: "Platform stack", status: "set", note: "pending update after CF migration" },
  { id: "BLK-003", title: "Landing page IA", status: "shipped" },
  { id: "BLK-004", title: "Three-tier compute model", status: "set" },
  { id: "BLK-005", title: "Auth (passkey + OAuth + password)", status: "shipped" },
  { id: "BLK-006", title: "Composer (internal dev tool)", status: "shipped" },
  { id: "BLK-007", title: "GateTest as PR gate", status: "building", note: "report-only; flip to hard gate after 2 clean PRs" },
  { id: "BLK-008", title: "Visual design system (Stripe direction)", status: "building" },
  { id: "BLK-009", title: "Git-push deploy pipeline", status: "planned" },
  { id: "BLK-010", title: "Stripe metered billing", status: "planned" },
  { id: "BLK-011", title: "CRDT collaboration production", status: "planned" },
  { id: "BLK-012", title: "Database inspector UI", status: "planned" },
  { id: "BLK-013", title: "Admin dashboard real data", status: "planned" },
  { id: "BLK-014", title: "Observability (Grafana LGTM)", status: "planned" },
  { id: "BLK-015", title: "Sentinel live service", status: "planned" },
  { id: "BLK-016", title: "Gluecron integration", status: "planned" },
  { id: "BLK-017", title: "Flywheel (shipped in #88)", status: "undocumented", note: "needs Bible entry" },
  { id: "BLK-018", title: "Voice dispatcher (shipped in #88)", status: "undocumented", note: "needs Bible entry" },
  { id: "BLK-019", title: "Build Theatre (shipped in #88)", status: "undocumented", note: "needs Bible entry" },
  { id: "BLK-020", title: "Crontech Independence (kill Vultr + Vercel SDK)", status: "proposed", note: "Phase A: ~3 working days" },
  { id: "BLK-021", title: "WebGPU draft model (Zoobicon TTFT <100ms)", status: "proposed" },
  { id: "BLK-022", title: "AI Gateway + BYOK", status: "proposed" },
  { id: "BLK-023", title: "Env-var migration in onboarding", status: "proposed" },
];

// ── Build-time metadata ──────────────────────────────────────────────
// GIT_SHA is baked into the client bundle at build time via the same
// env var the Dockerfile ARGs use. If it drifts from what /api/version
// reports, the deploy pipeline failed to roll.

// Vite statically replaces `import.meta.env.VITE_*` at build time; the
// property access itself is safe even on SSR because it's substituted
// before runtime. If the var is not set, we fall back to "local".
const BUILD_SHA: string =
  (import.meta.env.VITE_GIT_SHA as string | undefined) ?? "local";

function shortSha(sha: string): string {
  if (!sha || sha === "unknown" || sha === "local") return sha;
  return sha.slice(0, 7);
}

// ── Status styling ───────────────────────────────────────────────────

interface StatusStyle {
  readonly label: string;
  readonly color: string;
  readonly bg: string;
  readonly icon: string;
}

function statusStyle(status: BlockStatus): StatusStyle {
  switch (status) {
    case "shipped":
      return { label: "SHIPPED", color: "var(--color-success)", bg: "rgba(16,185,129,0.15)", icon: "✓" };
    case "set":
      return { label: "SET", color: "#06b6d4", bg: "rgba(6,182,212,0.15)", icon: "●" };
    case "building":
      return { label: "BUILDING", color: "var(--color-warning)", bg: "rgba(245,158,11,0.15)", icon: "◐" };
    case "planned":
      return { label: "PLANNED", color: "var(--color-primary)", bg: "rgba(99,102,241,0.15)", icon: "○" };
    case "paused":
      return { label: "PAUSED", color: "#94a3b8", bg: "rgba(148,163,184,0.15)", icon: "⏸" };
    case "undocumented":
      return { label: "NEEDS DOC", color: "var(--color-warning)", bg: "rgba(234,179,8,0.15)", icon: "⚠" };
    case "proposed":
      return { label: "PROPOSED", color: "#a78bfa", bg: "rgba(167,139,250,0.15)", icon: "?" };
  }
}

// ── Deploy-drift probe ───────────────────────────────────────────────

interface VersionResponse {
  readonly sha?: string;
  readonly service?: string;
  readonly timestamp?: string;
}

async function fetchVersion(): Promise<VersionResponse | null> {
  try {
    const res = await fetch("/api/version", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as VersionResponse;
  } catch {
    return null;
  }
}

// ── Persistence ──────────────────────────────────────────────────────

const COLLAPSE_KEY = "btf:buildtrack:collapsed";
const FORCE_KEY = "btf:buildtrack:force";

function readCollapsed(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return true;
  }
}

function writeCollapsed(value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(COLLAPSE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function readForce(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(FORCE_KEY) === "true";
  } catch {
    return false;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function BuildTrack(): JSX.Element {
  const auth = useAuth();
  const [collapsed, setCollapsed] = createSignal<boolean>(readCollapsed());
  const [forced, setForced] = createSignal<boolean>(false);
  const [liveSha, setLiveSha] = createSignal<string | null>(null);
  const [lastCheck, setLastCheck] = createSignal<string | null>(null);

  // Read the force flag only on client (avoid SSR window access).
  onMount(() => {
    setForced(readForce());
  });

  // Poll /api/version every 60s. Stops cleanly on unmount.
  let pollHandle: ReturnType<typeof setInterval> | null = null;

  async function probe(): Promise<void> {
    const v = await fetchVersion();
    if (v?.sha) {
      setLiveSha(v.sha);
      setLastCheck(new Date().toISOString());
    }
  }

  onMount(() => {
    void probe();
    pollHandle = setInterval(() => {
      void probe();
    }, 60_000);
  });

  onCleanup(() => {
    if (pollHandle !== null) clearInterval(pollHandle);
  });

  const visible = createMemo<boolean>(() => {
    // Opt-in only — even admins don't see this floating HUD by default.
    // Add `?buildtrack=1` to any URL or set localStorage to enable.
    // Admin-auto-show was making the chrome unreadable for admins who
    // just wanted to use the product.
    return forced();
  });

  const counts = createMemo(() => {
    let shipped = 0;
    let building = 0;
    let proposed = 0;
    let undocumented = 0;
    for (const b of BUILD_TRACK_BLOCKS) {
      if (b.status === "shipped") shipped++;
      else if (b.status === "building") building++;
      else if (b.status === "proposed") proposed++;
      else if (b.status === "undocumented") undocumented++;
    }
    return {
      shipped,
      building,
      proposed,
      undocumented,
      total: BUILD_TRACK_BLOCKS.length,
    };
  });

  const deployDrift = createMemo<"unknown" | "ok" | "drift">(() => {
    const live = liveSha();
    if (!live || live === "unknown") return "unknown";
    if (BUILD_SHA === "local") return "unknown";
    return live === BUILD_SHA ? "ok" : "drift";
  });

  const driftColor = createMemo<string>(() => {
    switch (deployDrift()) {
      case "ok":
        return "var(--color-success)";
      case "drift":
        return "var(--color-danger)";
      default:
        return "#94a3b8";
    }
  });

  const driftLabel = createMemo<string>(() => {
    switch (deployDrift()) {
      case "ok":
        return "Live SHA matches bundle — deploy healthy";
      case "drift":
        return `Deploy drift — bundle ${shortSha(BUILD_SHA)} but live ${shortSha(liveSha() ?? "")}`;
      default:
        return "Deploy SHA unknown (local dev or probe failed)";
    }
  });

  function toggleCollapse(): void {
    const next = !collapsed();
    setCollapsed(next);
    writeCollapsed(next);
  }

  return (
    <Show when={visible()}>
      <div
        role="complementary"
        aria-label="Build progress tracker"
        style={{
          position: "fixed",
          left: "1rem",
          bottom: "1rem",
          "z-index": 9998,
          "max-width": "min(28rem, calc(100vw - 2rem))",
          "font-family":
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: "var(--color-text)",
        }}
      >
        <Show
          when={!collapsed()}
          fallback={
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Expand build tracker"
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "0.5rem",
                padding: "0.5rem 0.85rem",
                "border-radius": "999px",
                background: "rgba(15,15,17,0.95)",
                border: "1px solid var(--color-border)",
                "box-shadow": "0 8px 24px rgba(0,0,0,0.4)",
                cursor: "pointer",
                "font-size": "0.8rem",
                color: "var(--color-text)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "8px",
                  height: "8px",
                  "border-radius": "50%",
                  background: driftColor(),
                  "box-shadow": `0 0 6px ${driftColor()}`,
                }}
              />
              <span style={{ "font-weight": 600 }}>
                {counts().shipped}/{counts().total} shipped
              </span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span style={{ "font-variant-numeric": "tabular-nums", opacity: 0.85 }}>
                {shortSha(BUILD_SHA)}
              </span>
            </button>
          }
        >
          <div
            style={{
              background: "rgba(15,15,17,0.96)",
              border: "1px solid var(--color-border)",
              "border-radius": "14px",
              "box-shadow": "0 16px 48px rgba(0,0,0,0.55)",
              overflow: "hidden",
              "backdrop-filter": "blur(8px)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                gap: "0.75rem",
                padding: "0.65rem 0.85rem",
                "border-bottom": "1px solid var(--color-border)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    "border-radius": "50%",
                    background: driftColor(),
                    "box-shadow": `0 0 6px ${driftColor()}`,
                  }}
                />
                <span style={{ "font-weight": 600, "font-size": "0.85rem" }}>
                  Build Track
                </span>
                <span style={{ opacity: 0.55, "font-size": "0.75rem" }}>
                  {counts().shipped}/{counts().total}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleCollapse}
                aria-label="Collapse build tracker"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                  "border-radius": "8px",
                  padding: "0.2rem 0.5rem",
                  "font-size": "0.75rem",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            {/* Deploy health strip */}
            <div
              style={{
                padding: "0.55rem 0.85rem",
                "border-bottom": "1px solid var(--color-border)",
                "font-size": "0.75rem",
                color: "var(--color-text-secondary)",
                display: "flex",
                "flex-direction": "column",
                gap: "0.2rem",
              }}
              title={driftLabel()}
            >
              <div>
                Bundle:{" "}
                <span style={{ color: "var(--color-text)", "font-variant-numeric": "tabular-nums" }}>
                  {shortSha(BUILD_SHA)}
                </span>
                {"  "}·  Live:{" "}
                <span style={{ color: driftColor(), "font-variant-numeric": "tabular-nums" }}>
                  {liveSha() ? shortSha(liveSha() as string) : "probing…"}
                </span>
              </div>
              <Show when={deployDrift() === "drift"}>
                <div style={{ color: "var(--color-danger)" }}>
                  Deploy drift — commits are not reaching production.
                </div>
              </Show>
              <Show when={lastCheck()}>
                <div style={{ opacity: 0.5 }}>
                  checked {(lastCheck() ?? "").slice(11, 19)}Z
                </div>
              </Show>
            </div>

            {/* Summary chips */}
            <div
              style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: "0.35rem",
                padding: "0.55rem 0.85rem",
                "border-bottom": "1px solid var(--color-border)",
              }}
            >
              <SummaryChip color="var(--color-success)" label={`${counts().shipped} shipped`} />
              <SummaryChip color="var(--color-warning)" label={`${counts().building} building`} />
              <SummaryChip color="#a78bfa" label={`${counts().proposed} proposed`} />
              <Show when={counts().undocumented > 0}>
                <SummaryChip
                  color="var(--color-warning)"
                  label={`${counts().undocumented} need Bible entry`}
                />
              </Show>
            </div>

            {/* Block list */}
            <div
              style={{
                "max-height": "min(60vh, 24rem)",
                overflow: "auto",
                padding: "0.35rem 0",
              }}
            >
              <For each={BUILD_TRACK_BLOCKS}>
                {(b) => {
                  const s = statusStyle(b.status);
                  return (
                    <div
                      style={{
                        display: "flex",
                        "align-items": "flex-start",
                        gap: "0.6rem",
                        padding: "0.4rem 0.85rem",
                        "font-size": "0.78rem",
                        "line-height": 1.4,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-flex",
                          "align-items": "center",
                          "justify-content": "center",
                          "min-width": "1.25rem",
                          height: "1.25rem",
                          "border-radius": "6px",
                          background: s.bg,
                          color: s.color,
                          "font-weight": 700,
                          "font-size": "0.7rem",
                        }}
                      >
                        {s.icon}
                      </span>
                      <div style={{ flex: 1, "min-width": 0 }}>
                        <div style={{ display: "flex", gap: "0.4rem", "align-items": "baseline" }}>
                          <span
                            style={{
                              "font-variant-numeric": "tabular-nums",
                              "font-weight": 600,
                              color: "var(--color-text)",
                            }}
                          >
                            {b.id}
                          </span>
                          <span style={{ color: "var(--color-text)", flex: 1 }}>{b.title}</span>
                        </div>
                        <Show when={b.note}>
                          <div style={{ color: "var(--color-text-muted)", "font-size": "0.72rem", "margin-top": "0.1rem" }}>
                            {b.note}
                          </div>
                        </Show>
                      </div>
                      <span
                        style={{
                          color: s.color,
                          "font-size": "0.65rem",
                          "font-weight": 700,
                          "letter-spacing": "0.04em",
                          "white-space": "nowrap",
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}

function SummaryChip(props: { color: string; label: string }): JSX.Element {
  return (
    <span
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "0.3rem",
        padding: "0.15rem 0.5rem",
        "border-radius": "999px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--color-border)",
        "font-size": "0.7rem",
        color: "var(--color-text)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          "border-radius": "50%",
          background: props.color,
        }}
      />
      {props.label}
    </span>
  );
}
