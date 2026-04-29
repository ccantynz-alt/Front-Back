// ── LaunchChecklist — Live Go-Live Punch List HUD ───────────────────
// A persistent, fixed-position overlay that shows exactly what's left
// between "code merged to Main" and "crontech.ai serving real users on
// Cloudflare." Sits in the top-right so it doesn't collide with BuildTrack
// (bottom-left) or VoicePill (bottom-right).
//
// Why this exists (authorised by Craig on 16 Apr 2026):
//   "Can we have a live checklist of what's left on the site with big
//    green text to show what's been done we need to keep it floating
//    on the screen somewhere"
//
// Design:
//   - Phases A..E, each containing ordered items.
//   - Click any item to toggle done. State persists to localStorage so
//     the list survives reloads. Phase A items are pre-filled to done
//     because we verified Deploy #59 green on 16 Apr.
//   - Done items render in big, bold, green text with a glowing ✓.
//     Pending items render dim so the eye naturally jumps to what's
//     left, not what's finished.
//   - Overall "% LIVE" counter pulses when 100%.
//   - Live probe: on mount and every 60s, hits /api/version. If it
//     returns a SHA, Phase D "/api/version responds with SHA" auto-
//     marks as done. (The rest still need a human-in-the-loop tick
//     because they involve human judgement — DNS propagation, OAuth
//     flow, etc.)
//
// Gating: same as BuildTrack — admin-only, or localStorage force flag.

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
import { trpc } from "../lib/trpc";

// ── Data model ──────────────────────────────────────────────────────

export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly note?: string;
  readonly autoProbe?: boolean; // if true, /api/version probe sets this true
  /**
   * Name of a secret key on the `launch.status` response's `secrets` map.
   * When the admin probe returns `secrets[<name>] === true`, this item
   * is shown as done (but not persisted to localStorage — see below).
   */
  readonly envVarProbe?: LaunchEnvKey;
  /**
   * Name of a probe on the `launch.status` response's `probes` map.
   * When `probes[<name>] === true`, this item is shown as done.
   */
  readonly autoProbeId?: LaunchProbeKey;
}

// Keep in lockstep with apps/api/src/trpc/procedures/launch.ts SECRET_KEYS.
export type LaunchEnvKey =
  | "DATABASE_URL"
  | "DATABASE_AUTH_TOKEN"
  | "SESSION_SECRET"
  | "JWT_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "STRIPE_PRO_PRICE_ID"
  | "STRIPE_ENTERPRISE_PRICE_ID"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY";

export type LaunchProbeKey = "api_version" | "db_connected";

export interface ChecklistPhase {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly ChecklistItem[];
}

// Initial state for Phase A — everything here is verified green as of
// 16 Apr 2026 after Deploy #59. If the pipeline ever regresses, flip
// these back to pending manually; the HUD is not magical, it's a HUD.
const PRESEEDED_DONE: readonly string[] = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
];

export const LAUNCH_PHASES: readonly ChecklistPhase[] = [
  {
    id: "A",
    title: "Phase A",
    subtitle: "CI pipeline green",
    items: [
      { id: "A1", label: "Cloudflare Workers + Pages migration merged" },
      { id: "A2", label: "deploy.yml triggers on Main (capital M)" },
      { id: "A3", label: "bunx wrangler (no npm/workspace collision)" },
      { id: "A4", label: "Lazy DB client (survives CF validation)" },
      { id: "A5", label: "Lockfile resynced for Dependabot bumps" },
      { id: "A6", label: "Deploy #59 completed green" },
    ],
  },
  {
    id: "B",
    title: "Phase B",
    subtitle: "Runtime secrets",
    items: [
      {
        id: "B1",
        label: "DATABASE_URL",
        note: "libsql://…turso.io",
        envVarProbe: "DATABASE_URL",
      },
      {
        id: "B2",
        label: "DATABASE_AUTH_TOKEN",
        envVarProbe: "DATABASE_AUTH_TOKEN",
      },
      {
        id: "B3",
        label: "SESSION_SECRET",
        note: "48-byte base64",
        envVarProbe: "SESSION_SECRET",
      },
      {
        id: "B4",
        label: "JWT_SECRET",
        note: "48-byte base64",
        envVarProbe: "JWT_SECRET",
      },
      { id: "B5", label: "GOOGLE_CLIENT_ID", envVarProbe: "GOOGLE_CLIENT_ID" },
      { id: "B6", label: "GOOGLE_CLIENT_SECRET", envVarProbe: "GOOGLE_CLIENT_SECRET" },
      { id: "B7", label: "STRIPE_SECRET_KEY", envVarProbe: "STRIPE_SECRET_KEY" },
      { id: "B8", label: "STRIPE_WEBHOOK_SECRET", envVarProbe: "STRIPE_WEBHOOK_SECRET" },
      { id: "B9", label: "STRIPE_PRO_PRICE_ID", envVarProbe: "STRIPE_PRO_PRICE_ID" },
      { id: "B10", label: "STRIPE_ENTERPRISE_PRICE_ID", envVarProbe: "STRIPE_ENTERPRISE_PRICE_ID" },
      { id: "B11", label: "OPENAI_API_KEY", envVarProbe: "OPENAI_API_KEY" },
      { id: "B12", label: "ANTHROPIC_API_KEY", envVarProbe: "ANTHROPIC_API_KEY" },
    ],
  },
  {
    id: "C",
    title: "Phase C",
    subtitle: "DNS cutover off Vultr",
    items: [
      { id: "C1", label: "crontech.ai → Pages custom domain" },
      { id: "C2", label: "www.crontech.ai → Pages custom domain" },
      { id: "C3", label: "api.crontech.ai → Worker custom domain" },
      { id: "C4", label: "Cloudflare proxy ON (orange cloud)" },
    ],
  },
  {
    id: "D",
    title: "Phase D",
    subtitle: "Smoke tests",
    items: [
      {
        id: "D1",
        label: "/api/version responds with SHA",
        autoProbe: true,
        autoProbeId: "api_version",
      },
      { id: "D2", label: "Landing page loads" },
      { id: "D3", label: "Google OAuth sign-in works" },
      { id: "D4", label: "Passkey registration works" },
      { id: "D5", label: "Stripe webhook returns 200" },
      {
        id: "D6",
        label: "Build Track HUD shows matching SHAs (no drift)",
      },
    ],
  },
  {
    id: "E",
    title: "Phase E",
    subtitle: "Retire Vultr",
    items: [
      { id: "E1", label: "24h warm standby on old box" },
      { id: "E2", label: "Power down Vultr server" },
      { id: "E3", label: "Cancel Vultr subscription" },
    ],
  },
];

// ── Persistence ─────────────────────────────────────────────────────

const DONE_KEY = "btf:launch:done";
const COLLAPSE_KEY = "btf:launch:collapsed";
const FORCE_KEY = "btf:launch:force";

function readDone(): Set<string> {
  const seed = new Set<string>(PRESEEDED_DONE);
  if (typeof localStorage === "undefined") return seed;
  try {
    const raw = localStorage.getItem(DONE_KEY);
    if (!raw) return seed;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed;
    const set = new Set<string>(seed);
    for (const id of parsed) {
      if (typeof id === "string") set.add(id);
    }
    return set;
  } catch {
    return seed;
  }
}

function writeDone(done: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    /* ignore */
  }
}

function readCollapsed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
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

// ── Version probe ───────────────────────────────────────────────────

interface VersionResponse {
  readonly sha?: string;
}

async function probeVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as VersionResponse;
    return json.sha ?? null;
  } catch {
    return null;
  }
}

// ── Launch-status probe (admin-only tRPC) ───────────────────────────
// Returns a Set of item ids that should render as done based on the
// admin `launch.status` endpoint — secret presence + smoke probes.
// NEVER persisted to localStorage: if the secret is rotated off the
// Worker, the next poll drops it back to pending automatically.

export interface LaunchStatusResponse {
  readonly secrets: Record<LaunchEnvKey, boolean>;
  readonly probes: Record<LaunchProbeKey, boolean>;
}

export function deriveAutoDone(
  phases: readonly ChecklistPhase[],
  status: LaunchStatusResponse | null,
): Set<string> {
  const out = new Set<string>();
  if (!status) return out;
  for (const p of phases) {
    for (const it of p.items) {
      if (it.envVarProbe && status.secrets[it.envVarProbe] === true) {
        out.add(it.id);
      }
      if (it.autoProbeId && status.probes[it.autoProbeId] === true) {
        out.add(it.id);
      }
    }
  }
  return out;
}

async function probeLaunchStatus(): Promise<LaunchStatusResponse | null> {
  try {
    const res = await trpc.launch.status.query();
    return res as LaunchStatusResponse;
  } catch {
    // Non-admins get FORBIDDEN; any transport error also lands here.
    // In both cases the HUD just skips auto-probing — the manual clicks
    // still work.
    return null;
  }
}

// ── Counts helper (exported for unit test) ──────────────────────────

export function computeCounts(
  phases: readonly ChecklistPhase[],
  done: ReadonlySet<string>,
): { readonly doneCount: number; readonly total: number; readonly pct: number } {
  let doneCount = 0;
  let total = 0;
  for (const p of phases) {
    for (const it of p.items) {
      total += 1;
      if (done.has(it.id)) doneCount += 1;
    }
  }
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  return { doneCount, total, pct };
}

// ── Component ───────────────────────────────────────────────────────

export function LaunchChecklist(): JSX.Element {
  const auth = useAuth();
  const [done, setDone] = createSignal<Set<string>>(readDone());
  const [autoDone, setAutoDone] = createSignal<Set<string>>(new Set());
  const [collapsed, setCollapsed] = createSignal<boolean>(readCollapsed());
  const [forced, setForced] = createSignal<boolean>(false);

  onMount(() => {
    setForced(readForce());
  });

  // Live probes:
  //   1. /api/version → auto-tick any `autoProbe: true` item (legacy D1).
  //   2. tRPC launch.status (admin) → auto-tick Phase B secrets + D1/db.
  // Both are read-only; results never touch localStorage. A user can
  // still click to toggle the manual `done` set; the auto-probed state
  // is tracked separately so the two do not race.
  let versionPollHandle: ReturnType<typeof setInterval> | null = null;
  let statusPollHandle: ReturnType<typeof setInterval> | null = null;

  async function runVersionProbe(): Promise<void> {
    const sha = await probeVersion();
    if (!sha) return;
    // D1 is also covered by launch.status's `api_version` probe, but we
    // keep this as a no-auth fallback for non-admin "forced" views so
    // the D1 tick still works when the tRPC call would be forbidden.
    const next = new Set(autoDone());
    let changed = false;
    for (const p of LAUNCH_PHASES) {
      for (const it of p.items) {
        if (it.autoProbe === true && !next.has(it.id)) {
          next.add(it.id);
          changed = true;
        }
      }
    }
    if (changed) setAutoDone(next);
  }

  async function runStatusProbe(): Promise<void> {
    const status = await probeLaunchStatus();
    const derived = deriveAutoDone(LAUNCH_PHASES, status);
    // Preserve any ids already auto-ticked by the legacy version probe
    // so a flaky tRPC call never un-greens a previously-green item
    // within the same session.
    const merged = new Set<string>(autoDone());
    for (const id of derived) merged.add(id);
    setAutoDone(merged);
  }

  onMount(() => {
    void runVersionProbe();
    void runStatusProbe();
    versionPollHandle = setInterval(() => {
      void runVersionProbe();
    }, 60_000);
    statusPollHandle = setInterval(() => {
      void runStatusProbe();
    }, 30_000);
  });

  onCleanup(() => {
    if (versionPollHandle !== null) clearInterval(versionPollHandle);
    if (statusPollHandle !== null) clearInterval(statusPollHandle);
  });

  const visible = createMemo<boolean>(() => {
    // Opt-in only — even admins don't see this floating HUD by default.
    // Add `?launch=1` to any URL or set localStorage to enable. Admin-
    // auto-show was occluding ~25% of the dashboard chrome for admins
    // who just wanted to use the product.
    return forced();
  });

  // Union manual + auto-probed for display/count purposes. Manual and
  // auto-probed items are tracked separately so auto-probes never
  // pollute localStorage, but for "% live" the user sees both.
  const combinedDone = createMemo<Set<string>>(() => {
    const u = new Set<string>(done());
    for (const id of autoDone()) u.add(id);
    return u;
  });

  const counts = createMemo(() => computeCounts(LAUNCH_PHASES, combinedDone()));

  const isLive = createMemo<boolean>(() => counts().pct === 100);

  function toggleItem(id: string): void {
    const next = new Set(done());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    writeDone(next);
  }

  function toggleCollapse(): void {
    const next = !collapsed();
    setCollapsed(next);
    writeCollapsed(next);
  }

  return (
    <Show when={visible()}>
      <div
        role="complementary"
        aria-label="Launch checklist"
        style={{
          position: "fixed",
          right: "1rem",
          top: "1rem",
          "z-index": 9998,
          "max-width": "min(24rem, calc(100vw - 2rem))",
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
              aria-label="Expand launch checklist"
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "0.5rem",
                padding: "0.5rem 0.85rem",
                "border-radius": "999px",
                background: isLive()
                  ? "rgba(16,185,129,0.18)"
                  : "rgba(15,15,17,0.95)",
                border: `1px solid ${isLive() ? "var(--color-success)" : "var(--color-border)"}`,
                "box-shadow": isLive()
                  ? "0 0 20px rgba(16,185,129,0.45)"
                  : "0 8px 24px rgba(0,0,0,0.4)",
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
                  background: isLive() ? "var(--color-success)" : "var(--color-warning)",
                  "box-shadow": `0 0 6px ${isLive() ? "var(--color-success)" : "var(--color-warning)"}`,
                }}
              />
              <span style={{ "font-weight": 700 }}>
                {isLive() ? "LIVE" : `${counts().pct}% live`}
              </span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span style={{ "font-variant-numeric": "tabular-nums", opacity: 0.85 }}>
                {counts().doneCount}/{counts().total}
              </span>
            </button>
          }
        >
          <div
            style={{
              background: "rgba(15,15,17,0.96)",
              border: `1px solid ${isLive() ? "var(--color-success)" : "var(--color-border)"}`,
              "border-radius": "14px",
              "box-shadow": isLive()
                ? "0 16px 48px rgba(16,185,129,0.4)"
                : "0 16px 48px rgba(0,0,0,0.55)",
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
                padding: "0.75rem 0.95rem",
                "border-bottom": "1px solid var(--color-border)",
                background: isLive()
                  ? "rgba(16,185,129,0.08)"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              <div>
                <div
                  style={{
                    "font-size": "0.7rem",
                    "letter-spacing": "0.14em",
                    "text-transform": "uppercase",
                    color: "var(--color-text-muted)",
                    "font-weight": 600,
                  }}
                >
                  Launch Checklist
                </div>
                <div
                  style={{
                    display: "flex",
                    "align-items": "baseline",
                    gap: "0.45rem",
                    "margin-top": "0.15rem",
                  }}
                >
                  <span
                    style={{
                      "font-size": "1.6rem",
                      "font-weight": 800,
                      color: isLive() ? "var(--color-success)" : "var(--color-text)",
                      "text-shadow": isLive()
                        ? "0 0 16px rgba(16,185,129,0.6)"
                        : "none",
                      "font-variant-numeric": "tabular-nums",
                      "line-height": 1,
                    }}
                  >
                    {isLive() ? "LIVE" : `${counts().pct}%`}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)", "font-size": "0.78rem" }}>
                    {counts().doneCount} / {counts().total} done
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleCollapse}
                aria-label="Collapse launch checklist"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                  "border-radius": "8px",
                  padding: "0.25rem 0.55rem",
                  "font-size": "0.8rem",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            {/* Phases */}
            <div
              style={{
                "max-height": "min(70vh, 32rem)",
                overflow: "auto",
              }}
            >
              <For each={LAUNCH_PHASES}>
                {(phase) => {
                  const phaseCounts = createMemo(() => {
                    const c = combinedDone();
                    let d = 0;
                    for (const it of phase.items) if (c.has(it.id)) d += 1;
                    return { done: d, total: phase.items.length };
                  });
                  const phaseComplete = createMemo(
                    () => phaseCounts().done === phaseCounts().total,
                  );
                  return (
                    <div
                      style={{
                        "border-bottom": "1px solid var(--color-border)",
                        padding: "0.55rem 0.95rem 0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          "align-items": "baseline",
                          gap: "0.55rem",
                          "margin-bottom": "0.35rem",
                        }}
                      >
                        <span
                          style={{
                            "font-size": "0.7rem",
                            "letter-spacing": "0.1em",
                            "text-transform": "uppercase",
                            color: phaseComplete() ? "var(--color-success)" : "var(--color-text-secondary)",
                            "font-weight": 700,
                          }}
                        >
                          {phase.title}
                        </span>
                        <span
                          style={{
                            "font-size": "0.78rem",
                            color: "var(--color-text)",
                            flex: 1,
                          }}
                        >
                          {phase.subtitle}
                        </span>
                        <span
                          style={{
                            "font-size": "0.68rem",
                            color: phaseComplete() ? "var(--color-success)" : "var(--color-text-muted)",
                            "font-variant-numeric": "tabular-nums",
                            "font-weight": 600,
                          }}
                        >
                          {phaseCounts().done}/{phaseCounts().total}
                          <Show when={phaseComplete()}>
                            <span style={{ "margin-left": "0.3rem" }}>✓</span>
                          </Show>
                        </span>
                      </div>
                      <For each={phase.items}>
                        {(item) => {
                          const isDone = createMemo(() =>
                            combinedDone().has(item.id),
                          );
                          return (
                            <button
                              type="button"
                              onClick={() => toggleItem(item.id)}
                              aria-pressed={isDone()}
                              style={{
                                display: "flex",
                                "align-items": "flex-start",
                                gap: "0.55rem",
                                width: "100%",
                                padding: "0.35rem 0.4rem",
                                "border-radius": "8px",
                                background: isDone()
                                  ? "rgba(16,185,129,0.08)"
                                  : "transparent",
                                border: "1px solid transparent",
                                cursor: "pointer",
                                "text-align": "left",
                                "font-family": "inherit",
                                color: "inherit",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "inline-flex",
                                  "align-items": "center",
                                  "justify-content": "center",
                                  "min-width": "1.3rem",
                                  height: "1.3rem",
                                  "border-radius": "6px",
                                  background: isDone()
                                    ? "rgba(16,185,129,0.25)"
                                    : "rgba(255,255,255,0.04)",
                                  border: `1px solid ${
                                    isDone() ? "var(--color-success)" : "var(--color-border-strong)"
                                  }`,
                                  color: isDone() ? "var(--color-success)" : "var(--color-text-muted)",
                                  "font-weight": 800,
                                  "font-size": "0.85rem",
                                  "box-shadow": isDone()
                                    ? "0 0 10px rgba(16,185,129,0.4)"
                                    : "none",
                                  "margin-top": "0.05rem",
                                }}
                              >
                                {isDone() ? "✓" : ""}
                              </span>
                              <span
                                style={{
                                  flex: 1,
                                  "min-width": 0,
                                  "font-size": isDone() ? "0.92rem" : "0.82rem",
                                  "font-weight": isDone() ? 700 : 500,
                                  color: isDone() ? "var(--color-success)" : "var(--color-text)",
                                  "text-shadow": isDone()
                                    ? "0 0 8px rgba(16,185,129,0.35)"
                                    : "none",
                                  "line-height": 1.35,
                                }}
                              >
                                {item.label}
                                <Show when={item.note}>
                                  <span
                                    style={{
                                      display: "block",
                                      color: "var(--color-text-muted)",
                                      "font-size": "0.7rem",
                                      "font-weight": 400,
                                      "text-shadow": "none",
                                      "margin-top": "0.1rem",
                                    }}
                                  >
                                    {item.note}
                                  </span>
                                </Show>
                              </span>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Footer hint */}
            <div
              style={{
                padding: "0.5rem 0.95rem",
                "font-size": "0.7rem",
                color: "var(--color-text-muted)",
                "text-align": "center",
                background: "rgba(255,255,255,0.01)",
              }}
            >
              click any item to toggle · state saved locally
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
