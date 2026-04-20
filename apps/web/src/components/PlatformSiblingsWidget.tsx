import { createResource, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type {
  SiblingHealth,
  SiblingsSnapshot,
  SiblingStatus,
} from "../lib/platform-siblings";

// ── Platform Siblings Widget ────────────────────────────────────────
// Cross-product health strip for the admin dashboard. Renders three
// cards — crontech, gluecron, gatetest — each showing:
//   • product name
//   • up / down / unreachable indicator
//   • round-trip latency
//   • last-updated timestamp (from the sibling's payload)
//
// Data comes from /api/admin/platform-siblings which is our server-
// side fan-out (3s timeout + 30s cache). If a sibling is unreachable
// the card degrades gracefully instead of crashing the widget.

const PRODUCT_LABEL: Record<string, string> = {
  crontech: "Crontech",
  gluecron: "Gluecron",
  gatetest: "GateTest",
};

const PRODUCT_ONELINER: Record<string, string> = {
  crontech: "This platform",
  gluecron: "Git hosting",
  gatetest: "Preview environments",
};

function statusColor(status: SiblingStatus): string {
  if (status === "up") return "var(--color-success)";
  if (status === "down") return "var(--color-danger)";
  return "var(--color-text-muted)";
}

function statusLabel(status: SiblingStatus): string {
  if (status === "up") return "up";
  if (status === "down") return "down";
  return "unreachable";
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) return "—";
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`;
  return `${Math.round(latencyMs)}ms`;
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function fetchSnapshot(force = false): Promise<SiblingsSnapshot> {
  const res = await fetch(
    force
      ? "/api/admin/platform-siblings?force=1"
      : "/api/admin/platform-siblings",
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`platform-siblings fetch failed: HTTP ${res.status}`);
  }
  return (await res.json()) as SiblingsSnapshot;
}

function SiblingCard(props: { sibling: SiblingHealth }): JSX.Element {
  return (
    <div
      class="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: "var(--color-bg-subtle)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col">
          <span
            class="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {PRODUCT_LABEL[props.sibling.product] ?? props.sibling.product}
          </span>
          <span class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>
            {PRODUCT_ONELINER[props.sibling.product] ?? "Sibling product"}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <div
            class="h-2.5 w-2.5 rounded-full"
            style={{ background: statusColor(props.sibling.status) }}
          />
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: `color-mix(in oklab, ${statusColor(props.sibling.status)} 10%, transparent)`,
              color: statusColor(props.sibling.status),
            }}
          >
            {statusLabel(props.sibling.status)}
          </span>
        </div>
      </div>

      <div class="flex items-center justify-between text-[11px]">
        <span style={{ color: "var(--color-text-faint)" }}>Latency</span>
        <span
          class="font-mono font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {formatLatency(props.sibling.latencyMs)}
        </span>
      </div>
      <div class="flex items-center justify-between text-[11px]">
        <span style={{ color: "var(--color-text-faint)" }}>Last updated</span>
        <span
          class="font-mono font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {formatLastUpdated(props.sibling.lastUpdated)}
        </span>
      </div>
      <Show when={props.sibling.commit}>
        {(commit) => (
          <div class="flex items-center justify-between text-[11px]">
            <span style={{ color: "var(--color-text-faint)" }}>Commit</span>
            <span
              class="font-mono"
              style={{ color: "var(--color-text-faint)" }}
            >
              {commit().slice(0, 8)}
            </span>
          </div>
        )}
      </Show>
      <Show when={props.sibling.status !== "up" && props.sibling.error}>
        {(error) => (
          <p
            class="rounded-md px-2 py-1 text-[11px]"
            style={{
              background:
                "color-mix(in oklab, var(--color-danger) 8%, transparent)",
              color: "var(--color-danger)",
            }}
          >
            {error()}
          </p>
        )}
      </Show>
    </div>
  );
}

export function PlatformSiblingsWidget(): JSX.Element {
  const [snapshot, { refetch }] = createResource(() => fetchSnapshot(false));

  return (
    <div
      class="rounded-2xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="mb-4 flex items-center justify-between">
        <div class="flex flex-col">
          <h2
            class="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Platform Family
          </h2>
          <p class="text-xs" style={{ color: "var(--color-text-faint)" }}>
            Live health across Crontech, Gluecron, and GateTest.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          class="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-200"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-subtle)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span>&#8635;</span>
          Refresh
        </button>
      </div>

      <Show
        when={snapshot()}
        fallback={
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <For each={[0, 1, 2]}>
              {() => (
                <div
                  class="h-32 animate-pulse rounded-xl"
                  style={{ background: "var(--color-bg-subtle)" }}
                />
              )}
            </For>
          </div>
        }
      >
        {(data) => (
          <>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <For each={data().siblings}>
                {(sibling) => <SiblingCard sibling={sibling} />}
              </For>
            </div>
            <p
              class="mt-3 text-[10px]"
              style={{ color: "var(--color-text-faint)" }}
            >
              Fan-out snapshot taken{" "}
              {new Date(data().fetchedAt).toLocaleTimeString()} · cached for 30s
            </p>
          </>
        )}
      </Show>
    </div>
  );
}
