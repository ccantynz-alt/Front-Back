// ── BLK-012 — /admin/db — Database Inspector (list) ─────────────────
// Admin-only read-only browser for every Turso + Neon table on the
// platform. v1: list + per-table row browser. v2 (out of scope):
// query builder + row edits.
//
// Wires to `trpc.dbInspector.listTables` (server-side admin allow-
// listed Drizzle tables, Neon via information_schema when configured).
//
// Polite tone — no named competitors. Zero raw HTML — SolidJS JSX +
// shared UI primitives only.

import { Title } from "@solidjs/meta";
import { createResource, For, Show, type JSX } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Spinner,
} from "@back-to-the-future/ui";
import { AdminRoute } from "../../components/AdminRoute";
import { useAuth } from "../../stores";
import { trpc } from "../../lib/trpc";

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

// ── Admin guard (inline — mirrors admin/sms.tsx) ────────────────────

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
              The database inspector is reserved for administrators. If you
              believe this is a mistake, please let Craig know.
            </Text>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
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
          <Text variant="h3" weight="semibold">
            {props.title}
          </Text>
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
                  href={`/admin/db/${encodeURIComponent(t.name)}?db=${props.dbKey}`}
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
                  <Stack
                    direction="horizontal"
                    gap="md"
                    align="center"
                  >
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

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminDbInspectorPage(): JSX.Element {
  const [data, { refetch }] = createResource(
    async (): Promise<ListTablesResponse> =>
      (await trpc.dbInspector.listTables.query()) as ListTablesResponse,
  );

  const handleRefresh = async (): Promise<void> => {
    await refetch();
  };

  return (
    <AdminGuard>
      <Title>Database Inspector — Crontech</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Database Inspector
          </Text>
          <Text variant="body" class="text-muted">
            A read-only browser for every table on both data tiers. Click a
            table to view its columns and paginated rows. Secret-looking
            columns (passwords, tokens, keys) are masked on display.
          </Text>
        </Stack>

        <Stack direction="horizontal" gap="sm">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </Stack>

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
              </Stack>
            )}
          </Show>
        </Show>
      </Stack>
    </AdminGuard>
  );
}
