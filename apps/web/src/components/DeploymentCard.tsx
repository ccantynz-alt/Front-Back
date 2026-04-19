import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { DeploymentLogs, type DeploymentLogLine } from "./DeploymentLogs";

// ── Types ────────────────────────────────────────────────────────────
//
// Mirrors the shape we expect from the future `trpc.deployments.list`
// procedure. The card is stateless on its own — the parent owns the
// deployment list and passes each one in. Expanding the card reveals
// the inline `DeploymentLogs` viewer.

export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "live"
  | "failed";

export interface Deployment {
  readonly id: string;
  readonly projectName: string;
  readonly projectSlug: string;
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly branch: string;
  readonly author: {
    readonly name: string;
    readonly avatarUrl?: string;
  };
  readonly status: DeploymentStatus;
  /** Duration in seconds. Null while the deployment is still running. */
  readonly durationSeconds: number | null;
  /** ISO 8601 timestamp of creation. */
  readonly createdAt: string;
  /** URL of the live deployment, if any. */
  readonly liveUrl?: string;
  readonly logs: ReadonlyArray<DeploymentLogLine>;
}

export interface DeploymentCardProps {
  readonly deployment: Deployment;
  readonly onRedeploy?: (deploymentId: string) => void;
  readonly onViewLogs?: (deploymentId: string) => void;
  /**
   * Cancel / rollback an in-flight deployment. When provided, queued or
   * building deployments expose a "Cancel" button that wires through the
   * optimistic-undo helper in the parent route.
   */
  readonly onRollback?: (deploymentId: string) => void;
  /**
   * When true, the expanded log viewer opens an SSE stream instead of
   * rendering the static `deployment.logs` array. Leave false for
   * fixture/preview pages where the backend isn't live.
   */
  readonly liveLogs?: boolean;
}

// ── Status Badge ─────────────────────────────────────────────────────

interface StatusStyle {
  readonly label: string;
  readonly color: string;
  readonly background: string;
  readonly border: string;
  readonly pulse: boolean;
  readonly dotColor: string;
}

function statusStyle(status: DeploymentStatus): StatusStyle {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        color: "#cbd5e1",
        background: "rgba(148, 163, 184, 0.14)",
        border: "rgba(148, 163, 184, 0.32)",
        pulse: false,
        dotColor: "#94a3b8",
      };
    case "building":
      return {
        label: "Building",
        color: "#93c5fd",
        background: "rgba(59, 130, 246, 0.14)",
        border: "rgba(96, 165, 250, 0.38)",
        pulse: true,
        dotColor: "#60a5fa",
      };
    case "deploying":
      return {
        label: "Deploying",
        color: "#d8b4fe",
        background: "rgba(168, 85, 247, 0.14)",
        border: "rgba(192, 132, 252, 0.38)",
        pulse: true,
        dotColor: "#c084fc",
      };
    case "live":
      return {
        label: "Live",
        color: "#86efac",
        background: "rgba(34, 197, 94, 0.14)",
        border: "rgba(74, 222, 128, 0.38)",
        pulse: false,
        dotColor: "#4ade80",
      };
    case "failed":
      return {
        label: "Failed",
        color: "#fca5a5",
        background: "rgba(239, 68, 68, 0.14)",
        border: "rgba(248, 113, 113, 0.38)",
        pulse: false,
        dotColor: "#f87171",
      };
  }
}

export function DeploymentStatusBadge(props: {
  status: DeploymentStatus;
}): JSX.Element {
  const s = (): StatusStyle => statusStyle(props.status);
  const dotShadow = (): string => {
    const style = s();
    return style.pulse
      ? `0 0 0 0 ${style.dotColor}66, 0 0 10px ${style.dotColor}aa`
      : `0 0 0 0 transparent`;
  };

  return (
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
      style={{
        color: s().color,
        background: s().background,
        border: `1px solid ${s().border}`,
      }}
      role="status"
      aria-label={`Status: ${s().label}`}
    >
      <span
        class="inline-block h-1.5 w-1.5 rounded-full"
        classList={{ "animate-pulse": s().pulse }}
        style={{
          background: s().dotColor,
          "box-shadow": dotShadow(),
        }}
        aria-hidden="true"
      />
      {s().label}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Running…";
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatRelativeTime(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const deltaSec = Math.max(0, Math.round((now - then) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    const min = Math.floor(deltaSec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

// ── Card ─────────────────────────────────────────────────────────────

export function DeploymentCard(props: DeploymentCardProps): JSX.Element {
  const [expanded, setExpanded] = createSignal<boolean>(false);

  const canRedeploy = (): boolean =>
    props.deployment.status === "live" || props.deployment.status === "failed";
  const canRollback = (): boolean =>
    props.onRollback !== undefined &&
    (props.deployment.status === "queued" ||
      props.deployment.status === "building" ||
      props.deployment.status === "deploying");
  const isStreaming = (): boolean =>
    props.deployment.status === "building" ||
    props.deployment.status === "deploying" ||
    props.deployment.status === "queued";

  function handleToggle(): void {
    setExpanded((v) => !v);
    if (!expanded() && props.onViewLogs) {
      props.onViewLogs(props.deployment.id);
    }
  }

  function handleRedeploy(e: MouseEvent): void {
    e.stopPropagation();
    if (!props.onRedeploy) return;
    props.onRedeploy(props.deployment.id);
  }

  function handleRollback(e: MouseEvent): void {
    e.stopPropagation();
    if (!props.onRollback) return;
    props.onRollback(props.deployment.id);
  }

  return (
    <div
      class="rounded-2xl transition-all duration-200"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header row — click to expand */}
      <button
        type="button"
        class="w-full text-left p-5 cursor-pointer rounded-2xl"
        aria-expanded={expanded()}
        aria-controls={`deployment-logs-${props.deployment.id}`}
        onClick={handleToggle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-bg-muted)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        style={{ background: "transparent" }}
      >
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Left — commit + meta */}
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <DeploymentStatusBadge status={props.deployment.status} />
              <span
                class="text-xs font-medium"
                style={{ color: "var(--color-text-muted)" }}
              >
                {props.deployment.projectName}
              </span>
              <span
                class="text-xs"
                style={{ color: "var(--color-text-faint)" }}
              >
                ·
              </span>
              <span
                class="text-xs font-mono"
                style={{ color: "var(--color-text-muted)" }}
              >
                {props.deployment.branch}
              </span>
            </div>
            <p
              class="truncate text-sm font-semibold"
              style={{ color: "var(--color-text)" }}
              title={props.deployment.commitMessage}
            >
              {props.deployment.commitMessage}
            </p>
            <div
              class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              <span class="font-mono">
                {shortSha(props.deployment.commitSha)}
              </span>
              <span>·</span>
              <span>{props.deployment.author.name}</span>
              <span>·</span>
              <span>{formatRelativeTime(props.deployment.createdAt)}</span>
              <span>·</span>
              <span>{formatDuration(props.deployment.durationSeconds)}</span>
            </div>
          </div>

          {/* Right — actions */}
          <div class="flex flex-shrink-0 items-center gap-2">
            <Show when={canRollback()}>
              <Button variant="outline" size="sm" onClick={handleRollback}>
                Cancel
              </Button>
            </Show>
            <Show when={canRedeploy()}>
              <Button variant="outline" size="sm" onClick={handleRedeploy}>
                Redeploy
              </Button>
            </Show>
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-md text-xs font-mono transition-transform duration-200"
              style={{
                color: "var(--color-text-muted)",
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border)",
                transform: expanded() ? "rotate(180deg)" : "rotate(0deg)",
              }}
              aria-hidden="true"
            >
              ▾
            </span>
          </div>
        </div>
      </button>

      {/* Expanded log viewer */}
      <Show when={expanded()}>
        <div
          id={`deployment-logs-${props.deployment.id}`}
          class="px-5 pb-5"
        >
          <DeploymentLogs
            deploymentId={props.deployment.id}
            lines={props.deployment.logs}
            live={props.liveLogs === true}
            streaming={isStreaming()}
          />
          <Show when={props.deployment.liveUrl}>
            <div class="mt-3 flex items-center justify-between text-xs">
              <span style={{ color: "var(--color-text-faint)" }}>
                Deployed URL
              </span>
              <a
                href={props.deployment.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="font-mono transition-colors"
                style={{ color: "var(--color-primary)" }}
              >
                {props.deployment.liveUrl}
              </a>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
