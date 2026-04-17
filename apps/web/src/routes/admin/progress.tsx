import { Title } from "@solidjs/meta";
import { createMemo, createResource, createSignal, For, Show, onCleanup, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Stack, Text, Badge } from "@back-to-the-future/ui";
import { AdminRoute } from "../../components/AdminRoute";
import { useAuth } from "../../stores";
import {
  parseProgressTracker,
  countByStatus,
  totalEntries,
  filterTracker,
  commitUrl,
  type ProgressEntry,
  type ProgressFilters,
  type ProgressPriority,
  type ProgressStatus,
  type ProgressTracker,
} from "../../lib/progress/schema";

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchTracker(): Promise<ProgressTracker> {
  const res = await fetch(`/progress.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to load progress.json: ${res.status}`);
  const raw: unknown = await res.json();
  return parseProgressTracker(raw);
}

function statusIcon(status: ProgressStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "⟳";
    case "blocked":
      return "✕";
    case "pending":
      return "○";
  }
}

function statusColor(status: ProgressStatus): string {
  switch (status) {
    case "completed":
      return "var(--color-success)";
    case "in_progress":
      return "var(--color-warning)";
    case "blocked":
      return "var(--color-danger)";
    case "pending":
      return "var(--color-text-muted)";
  }
}

function statusLabel(status: ProgressStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    case "blocked":
      return "Blocked";
    case "pending":
      return "Pending";
  }
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "p0":
      return "var(--color-danger)";
    case "p1":
      return "var(--color-warning)";
    case "p2":
      return "var(--color-info)";
    case "p3":
      return "var(--color-text-muted)";
    default:
      return "var(--color-text-muted)";
  }
}

const ALL_STATUSES: readonly ProgressStatus[] = [
  "completed",
  "in_progress",
  "pending",
  "blocked",
];
const ALL_PRIORITIES: readonly ProgressPriority[] = ["p0", "p1", "p2", "p3"];

// ── Admin Guard ─────────────────────────────────────────────────────

function AdminGuard(props: { children: JSX.Element }): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = (): boolean => auth.currentUser()?.role === "admin";

  return (
    <AdminRoute>
      <Show
        when={isAdmin()}
        fallback={
          <Stack direction="vertical" gap="md" class="page-padded">
            <Text variant="h2" weight="bold">
              Access Denied
            </Text>
            <Text variant="body" class="text-muted">
              You do not have permission to view this page. Admin role required.
            </Text>
            <Button variant="primary" size="sm" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </Stack>
        }
      >
        {props.children}
      </Show>
    </AdminRoute>
  );
}

// ── Filter pill ─────────────────────────────────────────────────────

function FilterPill(props: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: "6px 12px",
        "border-radius": "999px",
        "font-size": "12px",
        "font-weight": "600",
        cursor: "pointer",
        border: props.active
          ? `1px solid ${props.color}`
          : "1px solid var(--color-border)",
        background: props.active ? `${props.color}22` : "var(--color-bg-subtle)",
        color: props.active ? props.color : "var(--color-text-secondary)",
        transition: "all 0.15s ease",
      }}
    >
      {props.label}
    </button>
  );
}

// ── Entry Row ───────────────────────────────────────────────────────

function EntryRow(props: {
  entry: ProgressEntry;
  repoUrl: string | null;
}): JSX.Element {
  const entry = props.entry;
  const commitHref = (): string | null => commitUrl(props.repoUrl, entry.commit);
  return (
    <div
      style={{
        display: "grid",
        "grid-template-columns": "32px 1fr auto",
        gap: "12px",
        "align-items": "start",
        padding: "12px 16px",
        "border-bottom": "1px solid var(--color-border-subtle)",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          "border-radius": "50%",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "font-size": "16px",
          "font-weight": "bold",
          color: "var(--color-text)",
          "background-color": statusColor(entry.status),
        }}
        aria-label={statusLabel(entry.status)}
        title={statusLabel(entry.status)}
      >
        {statusIcon(entry.status)}
      </div>
      <div style={{ "min-width": "0" }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            "flex-wrap": "wrap",
          }}
        >
          <Text variant="body" weight="semibold">
            {entry.title}
          </Text>
          <span
            style={{
              "font-size": "10px",
              "font-weight": "bold",
              padding: "2px 6px",
              "border-radius": "4px",
              color: "var(--color-text)",
              "background-color": priorityColor(entry.priority),
              "text-transform": "uppercase",
            }}
          >
            {entry.priority}
          </span>
        </div>
        <Text variant="caption" class="text-muted">
          {entry.description}
        </Text>
        <Show when={entry.blockedReason}>
          <Text variant="caption" class="text-muted">
            Blocked: {entry.blockedReason}
          </Text>
        </Show>
        <div style={{ display: "flex", gap: "6px", "margin-top": "4px", "flex-wrap": "wrap" }}>
          <For each={entry.tags}>{(tag) => <Badge variant="default">{tag}</Badge>}</For>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "flex-end",
          gap: "4px",
          "font-size": "11px",
          color: "var(--color-text-muted)",
          "font-family": "monospace",
        }}
      >
        <Show when={entry.commit}>
          <Show
            when={commitHref()}
            fallback={<span>{entry.commit}</span>}
          >
            {(href) => (
              <a
                href={href()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--color-link)",
                  "text-decoration": "none",
                }}
                title="Open commit on GitHub"
              >
                {entry.commit}
              </a>
            )}
          </Show>
        </Show>
        <Show when={entry.branch}>
          <span>{entry.branch}</span>
        </Show>
        <Show when={entry.updatedAt}>
          {(ts) => (
            <span title={ts()} style={{ "font-size": "10px" }}>
              {ts().slice(0, 10)}
            </span>
          )}
        </Show>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

function ProgressPage(): JSX.Element {
  const [tick, setTick] = createSignal(0);
  const [tracker, { refetch }] = createResource(tick, fetchTracker);

  // ── Filter state ──
  const [selectedStatuses, setSelectedStatuses] = createSignal<ReadonlySet<ProgressStatus>>(
    new Set(),
  );
  const [selectedPriorities, setSelectedPriorities] = createSignal<
    ReadonlySet<ProgressPriority>
  >(new Set());
  const [search, setSearch] = createSignal("");
  const [within24h, setWithin24h] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());

  const toggleStatus = (s: ProgressStatus): void => {
    const next = new Set(selectedStatuses());
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSelectedStatuses(next);
  };
  const togglePriority = (p: ProgressPriority): void => {
    const next = new Set(selectedPriorities());
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelectedPriorities(next);
  };
  const toggleCollapse = (categoryId: string): void => {
    const next = new Set(collapsed());
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    setCollapsed(next);
  };
  const resetFilters = (): void => {
    setSelectedStatuses(new Set<ProgressStatus>());
    setSelectedPriorities(new Set<ProgressPriority>());
    setSearch("");
    setWithin24h(false);
  };

  // Auto-refresh every 30s for the "live" feel.
  const interval = setInterval(() => {
    setTick((t) => t + 1);
    void refetch();
  }, 30_000);
  onCleanup(() => clearInterval(interval));

  // Compute filtered view whenever filters or data change.
  const filtered = createMemo((): ProgressTracker | null => {
    const t = tracker();
    if (t === undefined) return null;
    const filters: ProgressFilters = {
      statuses: selectedStatuses(),
      priorities: selectedPriorities(),
      search: search(),
      within24h: within24h(),
      now: new Date(),
    };
    return filterTracker(t, filters);
  });

  const hasActiveFilters = createMemo((): boolean => {
    return (
      selectedStatuses().size > 0 ||
      selectedPriorities().size > 0 ||
      search().length > 0 ||
      within24h()
    );
  });

  return (
    <>
      <Title>Progress Tracker - Crontech Admin</Title>
      <div
        style={{
          "min-height": "100vh",
          background: "linear-gradient(180deg, var(--color-bg-deep) 0%, var(--color-bg-base) 100%)",
          color: "var(--color-text)",
          padding: "32px 24px",
        }}
      >
        <div style={{ "max-width": "1100px", margin: "0 auto" }}>
          <Stack direction="vertical" gap="lg">
            <div>
              <Text variant="h1" weight="bold">
                Crontech Master Game Plan
              </Text>
              <Text variant="body" class="text-muted">
                Live tracker. Every strategic decision, roadmap item, and blocker from the CFO
                lock-in session. Auto-refreshes every 30 seconds.
              </Text>
            </div>

            <Show
              when={tracker()}
              fallback={
                <Text variant="body" class="text-muted">
                  Loading progress...
                </Text>
              }
            >
              {(data) => {
                const counts = (): Record<ProgressStatus, number> => countByStatus(data());
                const total = (): number => totalEntries(data());
                const pct = (): number =>
                  total() === 0 ? 0 : Math.round((counts().completed / total()) * 100);
                const visibleCount = (): number => {
                  const f = filtered();
                  return f === null ? 0 : totalEntries(f);
                };

                return (
                  <>
                    {/* Header stats */}
                    <div
                      style={{
                        display: "grid",
                        "grid-template-columns": "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <StatBox
                        label="Completed"
                        value={`${counts().completed}`}
                        color={statusColor("completed")}
                      />
                      <StatBox
                        label="In progress"
                        value={`${counts().in_progress}`}
                        color={statusColor("in_progress")}
                      />
                      <StatBox
                        label="Pending"
                        value={`${counts().pending}`}
                        color={statusColor("pending")}
                      />
                      <StatBox
                        label="Blocked"
                        value={`${counts().blocked}`}
                        color={statusColor("blocked")}
                      />
                      <StatBox label="Total" value={`${total()}`} color="var(--color-accent)" />
                      <StatBox label="Complete" value={`${pct()}%`} color="var(--color-success)" />
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        height: "8px",
                        "border-radius": "4px",
                        background: "var(--color-bg-elevated)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct()}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, var(--color-success), var(--color-success-light))",
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>

                    {/* Doctrine banner */}
                    <div
                      style={{
                        padding: "12px 16px",
                        "border-radius": "8px",
                        background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
                      }}
                    >
                      <Text variant="caption" class="text-muted">
                        DOCTRINE
                      </Text>
                      <Text variant="body" weight="semibold">
                        {data().doctrine}
                      </Text>
                    </div>

                    {/* Filter bar */}
                    <div
                      style={{
                        padding: "16px",
                        "border-radius": "12px",
                        background: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border-subtle)",
                        display: "flex",
                        "flex-direction": "column",
                        gap: "12px",
                      }}
                    >
                      <input
                        type="search"
                        placeholder="Search by title, description, tag, or id…"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          "border-radius": "8px",
                          background: "var(--color-bg-deep)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text)",
                          "font-size": "14px",
                          outline: "none",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          "flex-wrap": "wrap",
                          gap: "8px",
                          "align-items": "center",
                        }}
                      >
                        <Text variant="caption" class="text-muted">
                          Status:
                        </Text>
                        <For each={ALL_STATUSES}>
                          {(s) => (
                            <FilterPill
                              label={statusLabel(s)}
                              active={selectedStatuses().has(s)}
                              color={statusColor(s)}
                              onClick={() => toggleStatus(s)}
                            />
                          )}
                        </For>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          "flex-wrap": "wrap",
                          gap: "8px",
                          "align-items": "center",
                        }}
                      >
                        <Text variant="caption" class="text-muted">
                          Priority:
                        </Text>
                        <For each={ALL_PRIORITIES}>
                          {(p) => (
                            <FilterPill
                              label={p.toUpperCase()}
                              active={selectedPriorities().has(p)}
                              color={priorityColor(p)}
                              onClick={() => togglePriority(p)}
                            />
                          )}
                        </For>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          "flex-wrap": "wrap",
                          gap: "8px",
                          "align-items": "center",
                          "justify-content": "space-between",
                        }}
                      >
                        <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
                          <FilterPill
                            label="Last 24h"
                            active={within24h()}
                            color="var(--color-accent)"
                            onClick={() => setWithin24h(!within24h())}
                          />
                          <Show when={hasActiveFilters()}>
                            <button
                              type="button"
                              onClick={resetFilters}
                              style={{
                                padding: "6px 12px",
                                "border-radius": "999px",
                                "font-size": "12px",
                                "font-weight": "600",
                                cursor: "pointer",
                                border: "1px solid var(--color-border)",
                                background: "transparent",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              Clear filters
                            </button>
                          </Show>
                        </div>
                        <Text variant="caption" class="text-muted">
                          Showing {visibleCount()} of {total()}
                        </Text>
                      </div>
                    </div>

                    {/* Categories */}
                    <Show
                      when={filtered()}
                      fallback={
                        <Text variant="body" class="text-muted">
                          No entries match the current filters.
                        </Text>
                      }
                    >
                      {(filteredData) => (
                        <Show
                          when={filteredData().categories.length > 0}
                          fallback={
                            <Text variant="body" class="text-muted">
                              No entries match the current filters.
                            </Text>
                          }
                        >
                          <For each={filteredData().categories}>
                            {(category) => {
                              const isCollapsed = (): boolean => collapsed().has(category.id);
                              return (
                                <div
                                  style={{
                                    "border-radius": "12px",
                                    background: "var(--color-bg-elevated)",
                                    border: "1px solid var(--color-border-subtle)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleCollapse(category.id)}
                                    style={{
                                      width: "100%",
                                      padding: "16px 20px",
                                      "border-bottom": isCollapsed()
                                        ? "none"
                                        : "1px solid var(--color-border-subtle)",
                                      background: "var(--color-bg-subtle)",
                                      border: "none",
                                      "border-top": "none",
                                      "border-left": "none",
                                      "border-right": "none",
                                      cursor: "pointer",
                                      "text-align": "left",
                                      color: "var(--color-text)",
                                      display: "flex",
                                      "align-items": "center",
                                      "justify-content": "space-between",
                                      gap: "12px",
                                    }}
                                    aria-expanded={!isCollapsed()}
                                  >
                                    <div style={{ "min-width": "0", flex: "1" }}>
                                      <Text variant="h3" weight="bold">
                                        {category.title}
                                      </Text>
                                      <Text variant="caption" class="text-muted">
                                        {category.subtitle}
                                      </Text>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "12px",
                                        "align-items": "center",
                                      }}
                                    >
                                      <span
                                        style={{
                                          "font-size": "12px",
                                          color: "var(--color-text-muted)",
                                          "font-variant-numeric": "tabular-nums",
                                        }}
                                      >
                                        {category.entries.length}
                                      </span>
                                      <span
                                        style={{
                                          "font-size": "16px",
                                          color: "var(--color-text-muted)",
                                          transform: isCollapsed()
                                            ? "rotate(-90deg)"
                                            : "rotate(0deg)",
                                          transition: "transform 0.15s ease",
                                          display: "inline-block",
                                        }}
                                      >
                                        ▾
                                      </span>
                                    </div>
                                  </button>
                                  <Show when={!isCollapsed()}>
                                    <div>
                                      <For each={category.entries}>
                                        {(entry) => (
                                          <EntryRow entry={entry} repoUrl={data().repoUrl} />
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </div>
                              );
                            }}
                          </For>
                        </Show>
                      )}
                    </Show>

                    <Text variant="caption" class="text-muted">
                      Last updated: {data().lastUpdated} · Session: {data().session}
                    </Text>
                  </>
                );
              }}
            </Show>
          </Stack>
        </div>
      </div>
    </>
  );
}

function StatBox(props: { label: string; value: string; color: string }): JSX.Element {
  return (
    <div
      style={{
        padding: "16px",
        "border-radius": "10px",
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-subtle)",
      }}
    >
      <div
        style={{
          "font-size": "11px",
          "text-transform": "uppercase",
          "letter-spacing": "0.08em",
          color: "var(--color-text-muted)",
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          "font-size": "28px",
          "font-weight": "bold",
          color: props.color,
          "margin-top": "4px",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

export default function AdminProgressRoute(): JSX.Element {
  return (
    <AdminGuard>
      <ProgressPage />
    </AdminGuard>
  );
}
