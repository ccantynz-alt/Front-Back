// ── BLK-012 — /database — Database Inspector (public entry) ─────────
//
// Real, admin-gated, read-only browser for every Turso + Neon table on
// the platform. v1 replaces the honest-preview waitlist page with the
// genuine inspector that wires to `trpc.dbInspector.listTables`.
//
// v1 scope (BUILD_BIBLE BLK-012):
//   • List tables across both tiers with real row counts.
//   • Click-through to /database/[table] for a per-table row browser.
//   • Bounded, read-only queries — all the server-side safety lives
//     in the tRPC procedure (allow-list, secret masking, row caps).
//
// Non-scope (BLK-012):
//   • Write access from the UI.
//   • Schema migrations from the UI.
//
// Access model:
//   • Authenticated admin → sees the inspector.
//   • Authenticated non-admin → sees an "Admin only" message with a
//     polite contact-support link.
//   • Unauthenticated → AdminRoute redirects to /login.
//
// Polite tone per docs/POSITIONING.md — no competitor names. Zero
// raw HTML in business logic — SolidJS JSX + shared UI primitives.

import { Title } from "@solidjs/meta";
import {
  createResource,
  createSignal,
  For,
  Show,
  type JSX,
} from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Spinner,
  Alert,
} from "@back-to-the-future/ui";
import { AdminRoute } from "../components/AdminRoute";
import { SEOHead } from "../components/SEOHead";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";

// ── Types ───────────────────────────────────────────────────────────

interface TableSummary {
  name: string;
  rowCount: number;
}

interface ListTablesResponse {
  turso: TableSummary[];
  neon: TableSummary[];
  neonConfigured: boolean;
}

// ── Pure helpers (exported for tests) ───────────────────────────────

/** Human-readable label for a row count (handles large numbers). */
export function formatRowCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Badge variant for a row-count bucket (visual scanning aid). */
export function rowCountVariant(
  n: number,
): "success" | "warning" | "error" | "default" {
  if (!Number.isFinite(n) || n < 0) return "default";
  if (n === 0) return "default";
  if (n < 100) return "success";
  if (n < 10_000) return "warning";
  return "error";
}

/**
 * Build a polite, bounded SELECT snippet that developers can paste
 * into their own SQL console. Always LIMIT 25 — never leaks the full
 * dataset, matches the inspector's read-only / bounded contract.
 */
export function buildSelectSnippet(
  table: string,
  db: "turso" | "neon",
): string {
  const engine = db === "turso" ? "Turso (edge)" : "Neon (serverless PG)";
  return `-- ${engine}\nSELECT * FROM "${table}" LIMIT 25;`;
}

// ── Admin guard (inline — mirrors admin/db.tsx pattern) ─────────────

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
              Admin only
            </Text>
            <Text variant="body" class="text-muted">
              The database inspector is reserved for administrators. If you
              believe this is a mistake, please contact support and we'll
              sort it out.
            </Text>
            <Stack direction="horizontal" gap="sm">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/support")}
              >
                Contact support
              </Button>
            </Stack>
          </Stack>
        }
      >
        {props.children}
      </Show>
    </AdminRoute>
  );
}

// ── Section: one database's table list ──────────────────────────────

interface DatabaseSectionProps {
  title: string;
  subtitle: string;
  tables: TableSummary[];
  dbKey: "turso" | "neon";
  empty: string;
}

function DatabaseSection(props: DatabaseSectionProps): JSX.Element {
  return (
    <Card padding="md">
      <Stack direction="vertical" gap="sm">
        <Stack direction="vertical" gap="xs">
          <Stack direction="horizontal" gap="sm" align="center">
            <Text variant="h3" weight="semibold">
              {props.title}
            </Text>
            <Badge variant="success" size="sm">
              {props.tables.length} tables
            </Badge>
          </Stack>
          <Text variant="caption" class="text-muted">
            {props.subtitle}
          </Text>
        </Stack>

        <Show
          when={props.tables.length > 0}
          fallback={
            <Text variant="body" class="text-muted">
              {props.empty}
            </Text>
          }
        >
          <Stack direction="vertical" gap="xs">
            <For each={props.tables}>
              {(t) => (
                <A
                  href={`/database/${encodeURIComponent(t.name)}?db=${props.dbKey}`}
                  class="db-table-row"
                  style={{
                    display: "block",
                    padding: "0.5rem 0.75rem",
                    "border-radius": "0.5rem",
                    "text-decoration": "none",
                    color: "inherit",
                    background: "var(--color-bg-muted, transparent)",
                  }}
                >
                  <Stack direction="horizontal" gap="md" align="center">
                    <Text variant="body" weight="semibold">
                      {t.name}
                    </Text>
                    <Badge variant={rowCountVariant(t.rowCount)} size="sm">
                      {formatRowCount(t.rowCount)} rows
                    </Badge>
                  </Stack>
                </A>
              )}
            </For>
          </Stack>
        </Show>
      </Stack>
    </Card>
  );
}

// ── Connection-status pill ──────────────────────────────────────────

interface ConnectionPillProps {
  label: string;
  kind: "ok" | "empty" | "offline";
}

function ConnectionPill(props: ConnectionPillProps): JSX.Element {
  const dotColor = (): string => {
    if (props.kind === "ok") return "#10b981";
    if (props.kind === "empty") return "#fbbf24";
    return "#f87171";
  };
  return (
    <Stack direction="horizontal" gap="xs" align="center">
      <span
        style={{
          display: "inline-block",
          width: "0.5rem",
          height: "0.5rem",
          "border-radius": "9999px",
          background: dotColor(),
        }}
        aria-hidden="true"
      />
      <Text variant="caption" class="text-muted">
        {props.label}
      </Text>
    </Stack>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function DatabasePage(): JSX.Element {
  const [data, { refetch }] = createResource(
    async (): Promise<ListTablesResponse> =>
      (await trpc.dbInspector.listTables.query()) as ListTablesResponse,
  );

  const [refreshing, setRefreshing] = createSignal(false);
  const [copyState, setCopyState] = createSignal<string | null>(null);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopySample = async (): Promise<void> => {
    const snippet = buildSelectSnippet("users", "turso");
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(snippet);
        setCopyState("Copied sample SELECT to clipboard.");
        setTimeout(() => setCopyState(null), 2400);
      }
    } catch {
      setCopyState("Clipboard unavailable — open a table to view the SQL.");
      setTimeout(() => setCopyState(null), 2400);
    }
  };

  const tursoStatus = (): "ok" | "empty" | "offline" => {
    if (data.error) return "offline";
    const d = data();
    if (!d) return "offline";
    return d.turso.length > 0 ? "ok" : "empty";
  };

  const neonStatus = (): "ok" | "empty" | "offline" => {
    if (data.error) return "offline";
    const d = data();
    if (!d) return "offline";
    if (!d.neonConfigured) return "offline";
    return d.neon.length > 0 ? "ok" : "empty";
  };

  return (
    <>
      <SEOHead
        title="Database Inspector"
        description="A read-only inspector for every Turso and Neon table on your Crontech project. Browse schema and rows without leaving the dashboard."
        path="/database"
      />

      <AdminGuard>
        <Title>Database Inspector — Crontech</Title>
        <Stack direction="vertical" gap="lg" class="page-padded">
          {/* ── Header ─────────────────────────────────────────── */}
          <Stack direction="vertical" gap="xs">
            <Stack direction="horizontal" gap="sm" align="center">
              <Text variant="h1" weight="bold">
                Database Inspector
              </Text>
              <Badge variant="success" size="sm">
                Live
              </Badge>
            </Stack>
            <Text variant="body" class="text-muted">
              Read-only browser for every table on both data tiers. Click a
              table to view its columns and paginated rows. Secret-looking
              columns (passwords, tokens, keys) are masked on display. All
              queries are bounded — no mutations, no schema changes.
            </Text>
          </Stack>

          {/* ── Connection pills + actions ─────────────────────── */}
          <Card padding="sm">
            <Stack
              direction="horizontal"
              gap="md"
              align="center"
              justify="between"
            >
              <Stack direction="horizontal" gap="md" align="center">
                <ConnectionPill
                  label={`Turso: ${
                    tursoStatus() === "ok"
                      ? "connected"
                      : tursoStatus() === "empty"
                        ? "no tables registered"
                        : "unreachable"
                  }`}
                  kind={tursoStatus()}
                />
                <ConnectionPill
                  label={`Neon: ${
                    neonStatus() === "ok"
                      ? "connected"
                      : neonStatus() === "empty"
                        ? "no tables registered"
                        : "not configured"
                  }`}
                  kind={neonStatus()}
                />
              </Stack>
              <Stack direction="horizontal" gap="sm" align="center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySample}
                >
                  Copy sample SQL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing()}
                >
                  {refreshing() ? "Refreshing…" : "Refresh"}
                </Button>
              </Stack>
            </Stack>
          </Card>

          <Show when={copyState()}>
            {(msg) => <Alert variant="success">{msg()}</Alert>}
          </Show>

          <Show when={data.error}>
            <Alert variant="error">
              The inspector couldn't reach the database service. This usually
              means the API server is still starting or you've lost your
              session — try refreshing in a moment. Nothing has been changed.
            </Alert>
          </Show>

          {/* ── Loading / Empty / Data ─────────────────────────── */}
          <Show when={!data.loading} fallback={<Spinner />}>
            <Show
              when={data()}
              fallback={
                <Text variant="body" class="text-muted">
                  No database connection is available on this instance.
                </Text>
              }
            >
              {(resolved) => (
                <Stack direction="vertical" gap="lg">
                  <DatabaseSection
                    title="Turso (edge)"
                    subtitle="Edge SQLite — primary data store, low-latency reads from every region."
                    tables={resolved().turso}
                    dbKey="turso"
                    empty="No Turso tables are currently registered."
                  />
                  <DatabaseSection
                    title="Neon (serverless PG)"
                    subtitle={
                      resolved().neonConfigured
                        ? "Serverless PostgreSQL — complex queries, vector search, pgvector embeddings."
                        : "Neon is not configured on this instance. Set NEON_DATABASE_URL to enable."
                    }
                    tables={resolved().neon}
                    dbKey="neon"
                    empty={
                      resolved().neonConfigured
                        ? "No Neon tables are currently registered."
                        : "Neon is not configured on this instance."
                    }
                  />

                  {/* Safety notes — keep the doctrine visible */}
                  <Card padding="md">
                    <Stack direction="vertical" gap="xs">
                      <Text variant="h3" weight="semibold">
                        Safety rules
                      </Text>
                      <Text variant="caption" class="text-muted">
                        • Every query is read-only and capped at 100 rows per
                        page / 500 rows per call.
                      </Text>
                      <Text variant="caption" class="text-muted">
                        • Passwords, tokens, API keys and private keys are
                        masked before they ever leave the server.
                      </Text>
                      <Text variant="caption" class="text-muted">
                        • Only tables registered in the platform schema can be
                        browsed — no arbitrary SQL surfaces from this UI.
                      </Text>
                    </Stack>
                  </Card>
                </Stack>
              )}
            </Show>
          </Show>
        </Stack>
      </AdminGuard>
    </>
  );
}
