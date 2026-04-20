// ── BLK-012 — /admin/db/:table — Database Inspector (detail) ────────
// Admin-only per-table viewer. Shows column metadata at the top and
// paginated rows below. Secret-looking columns (passwords, tokens,
// keys) are masked server-side — the UI simply renders what the API
// returns.
//
// Wires to:
//   • trpc.dbInspector.describeTable({ db, table })
//   • trpc.dbInspector.selectPage({ db, table, page, pageSize })
//
// Page size is fixed at 50 on this route (server caps at 100).
// Zero HTML — SolidJS JSX + shared UI primitives only.

import { Title } from "@solidjs/meta";
import {
  createResource,
  createSignal,
  For,
  Show,
  type JSX,
} from "solid-js";
import { A, useParams, useSearchParams, useNavigate } from "@solidjs/router";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Spinner,
  Alert,
} from "@back-to-the-future/ui";
import { AdminRoute } from "../../../components/AdminRoute";
import { useAuth } from "../../../stores";
import { trpc } from "../../../lib/trpc";

// ── Types ───────────────────────────────────────────────────────────

type DbKind = "turso" | "neon";

interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isSecret: boolean;
}

interface DescribeTableResponse {
  db: DbKind;
  table: string;
  rowCount: number;
  columns: ColumnInfo[];
}

interface SelectPageResponse {
  db: DbKind;
  table: string;
  page: number;
  pageSize: number;
  totalRows: number;
  maskedColumns: string[];
  rows: Record<string, unknown>[];
}

const PAGE_SIZE = 50;

// ── Pure helpers (exported for tests) ───────────────────────────────

/** Normalise the ?db= query param to a safe DbKind default. */
export function parseDbKind(raw: string | undefined | null): DbKind {
  return raw === "neon" ? "neon" : "turso";
}

/** Render a single cell value as a printable string. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (value === "[REDACTED]") return "[REDACTED]";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserialisable]";
    }
  }
  return String(value);
}

/** Calculate total number of pages for a given total + pageSize. */
export function totalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

// ── Admin guard (inline — mirrors admin/sms.tsx pattern) ────────────

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
              The database inspector is reserved for administrators.
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

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminDbTableDetailPage(): JSX.Element {
  const params = useParams<{ table: string }>();
  const [searchParams] = useSearchParams();
  const dbKind = (): DbKind => parseDbKind(searchParams.db as string | undefined);
  const tableName = (): string => params.table;

  const [page, setPage] = createSignal(1);

  const [describe] = createResource(
    () => ({ db: dbKind(), table: tableName() }),
    async ({ db, table }): Promise<DescribeTableResponse> =>
      (await trpc.dbInspector.describeTable.query({
        db,
        table,
      })) as DescribeTableResponse,
  );

  const [pageData, { refetch }] = createResource(
    () => ({ db: dbKind(), table: tableName(), page: page() }),
    async ({ db, table, page: p }): Promise<SelectPageResponse> =>
      (await trpc.dbInspector.selectPage.query({
        db,
        table,
        page: p,
        pageSize: PAGE_SIZE,
      })) as SelectPageResponse,
  );

  const handleRefresh = async (): Promise<void> => {
    await refetch();
  };

  const goPrev = (): void => {
    if (page() > 1) setPage(page() - 1);
  };
  const goNext = (): void => {
    const d = pageData();
    if (!d) return;
    const pages = totalPages(d.totalRows, d.pageSize);
    if (page() < pages) setPage(page() + 1);
  };

  return (
    <AdminGuard>
      <Title>Table: {tableName()} — Database Inspector</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        {/* Breadcrumb */}
        <Stack direction="horizontal" gap="xs" align="center">
          <A
            href="/admin"
            style={{ "text-decoration": "none", color: "inherit" }}
          >
            <Text variant="caption" class="text-muted">
              Admin
            </Text>
          </A>
          <Text variant="caption" class="text-muted">
            /
          </Text>
          <A
            href="/admin/db"
            style={{ "text-decoration": "none", color: "inherit" }}
          >
            <Text variant="caption" class="text-muted">
              Database Inspector
            </Text>
          </A>
          <Text variant="caption" class="text-muted">
            /
          </Text>
          <Text variant="caption" weight="semibold">
            {tableName()}
          </Text>
        </Stack>

        {/* Title row */}
        <Stack direction="vertical" gap="xs">
          <Stack direction="horizontal" gap="sm" align="center">
            <Text variant="h1" weight="bold">
              {tableName()}
            </Text>
            <Badge variant="default" size="sm">
              {dbKind() === "turso" ? "Turso (edge)" : "Neon (serverless PG)"}
            </Badge>
          </Stack>
          <Text variant="body" class="text-muted">
            Read-only. Pagination capped at {PAGE_SIZE} rows per page and 500
            rows in total per call. Secret-looking columns are masked on
            display.
          </Text>
        </Stack>

        <Stack direction="horizontal" gap="sm">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </Stack>

        {/* Column metadata */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h3" weight="semibold">
              Columns
            </Text>
            <Show when={!describe.loading} fallback={<Spinner />}>
              <Show
                when={describe()}
                fallback={
                  <Text variant="body" class="text-muted">
                    Unable to describe this table.
                  </Text>
                }
              >
                {(resolved) => (
                  <Stack direction="vertical" gap="xs">
                    <For each={resolved().columns}>
                      {(col) => (
                        <Stack
                          direction="horizontal"
                          gap="md"
                          align="center"
                        >
                          <Text
                            variant="body"
                            weight={col.isPrimaryKey ? "semibold" : "normal"}
                          >
                            {col.name}
                          </Text>
                          <Badge variant="default" size="sm">
                            {col.dataType}
                          </Badge>
                          <Show when={col.isPrimaryKey}>
                            <Badge variant="warning" size="sm">
                              PK
                            </Badge>
                          </Show>
                          <Show when={col.nullable}>
                            <Badge variant="default" size="sm">
                              nullable
                            </Badge>
                          </Show>
                          <Show when={col.isSecret}>
                            <Badge variant="error" size="sm">
                              redacted
                            </Badge>
                          </Show>
                        </Stack>
                      )}
                    </For>
                    <Text variant="caption" class="text-muted">
                      {resolved().rowCount.toLocaleString()} total row
                      {resolved().rowCount === 1 ? "" : "s"}.
                    </Text>
                  </Stack>
                )}
              </Show>
            </Show>
          </Stack>
        </Card>

        {/* Rows */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Stack
              direction="horizontal"
              gap="md"
              align="center"
              justify="between"
            >
              <Text variant="h3" weight="semibold">
                Rows
              </Text>
              <Show when={pageData()}>
                {(d) => (
                  <Text variant="caption" class="text-muted">
                    Page {d().page} of {totalPages(d().totalRows, d().pageSize)}
                  </Text>
                )}
              </Show>
            </Stack>

            <Show when={pageData()?.maskedColumns?.length}>
              <Alert variant="warning">
                Masked {pageData()?.maskedColumns?.length ?? 0} secret-looking
                column(s): {pageData()?.maskedColumns?.join(", ")}
              </Alert>
            </Show>

            <Show when={!pageData.loading} fallback={<Spinner />}>
              <Show
                when={pageData()}
                fallback={
                  <Text variant="body" class="text-muted">
                    Unable to load rows.
                  </Text>
                }
              >
                {(resolved) => (
                  <Show
                    when={resolved().rows.length > 0}
                    fallback={
                      <Text variant="body" class="text-muted">
                        No rows on this page.
                      </Text>
                    }
                  >
                    <div
                      style={{
                        "overflow-x": "auto",
                        "font-family": "ui-monospace, monospace",
                        "font-size": "0.85rem",
                      }}
                    >
                      <Stack direction="vertical" gap="xs">
                        <For each={resolved().rows}>
                          {(row, i) => (
                            <Card padding="sm">
                              <Stack direction="vertical" gap="xs">
                                <Text variant="caption" class="text-muted">
                                  Row {(resolved().page - 1) * resolved().pageSize + i() + 1}
                                </Text>
                                <Stack direction="vertical" gap="xs">
                                  <For each={Object.entries(row)}>
                                    {([key, value]) => (
                                      <Stack
                                        direction="horizontal"
                                        gap="md"
                                        align="start"
                                      >
                                        <div
                                          style={{
                                            "min-width": "10rem",
                                            color: "var(--color-text-muted)",
                                          }}
                                        >
                                          <Text
                                            variant="caption"
                                            weight="semibold"
                                          >
                                            {key}
                                          </Text>
                                        </div>
                                        <div
                                          style={{
                                            flex: "1",
                                            "word-break": "break-all",
                                          }}
                                        >
                                          <Text variant="caption">
                                            {formatCell(value)}
                                          </Text>
                                        </div>
                                      </Stack>
                                    )}
                                  </For>
                                </Stack>
                              </Stack>
                            </Card>
                          )}
                        </For>
                      </Stack>
                    </div>
                  </Show>
                )}
              </Show>
            </Show>

            {/* Pagination */}
            <Stack direction="horizontal" gap="sm" align="center">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={page() <= 1}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={
                  !pageData() ||
                  page() >=
                    totalPages(
                      pageData()?.totalRows ?? 0,
                      pageData()?.pageSize ?? PAGE_SIZE,
                    )
                }
              >
                Next
              </Button>
              <Text variant="caption" class="text-muted">
                Showing {PAGE_SIZE} rows per page.
              </Text>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </AdminGuard>
  );
}
