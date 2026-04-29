// ── /admin/dns ───────────────────────────────────────────────────────
// Admin-only Authoritative DNS zone list + inline "add zone" form.
// Lists every zone Crontech is authoritative for, with record count,
// serial, created timestamp, and row-level edit/delete actions.
//
// Data comes from the tRPC `dns.*` namespace (DNS-API agent owns
// those procedures). The page expects:
//
//   • trpc.dns.listZones  — returns ZoneRow[]
//   • trpc.dns.createZone — accepts { zoneName, adminEmail,
//                                      primaryNs, secondaryNs? }
//   • trpc.dns.deleteZone — accepts { id }
//
// Zero HTML — SolidJS JSX + shared UI patterns. Polite tone; no
// competitor names. Wrapped in `AdminRoute` the same way admin.tsx
// gates its page content.

import { Title } from "@solidjs/meta";
import {
  createSignal,
  createResource,
  For,
  Show,
  type JSX,
} from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Box, Container, Stack, Text } from "@back-to-the-future/ui";
import { AdminRoute } from "../../components/AdminRoute";
import { showToast } from "../../components/Toast";
import { trpc } from "../../lib/trpc";

// ── Types ───────────────────────────────────────────────────────────

interface ZoneRow {
  id: string;
  name: string;
  adminEmail: string;
  primaryNs: string;
  secondaryNs: string | null;
  recordCount: number;
  serial: number;
  createdAt: Date | string;
}

interface NewZoneForm {
  zoneName: string;
  adminEmail: string;
  primaryNs: string;
  secondaryNs: string;
}

// ── Pure helpers (exported for tests) ───────────────────────────────

/**
 * Canonical DNS zone-name validator. Accepts lowercase labels
 * separated by dots, with no trailing dot. This is intentionally
 * loose — the server is the source of truth — but it keeps the
 * inline form from round-tripping obvious garbage.
 */
export function isValidZoneName(name: string): boolean {
  if (!name || name.length > 253) return false;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith(".") || trimmed.endsWith(".")) return false;
  const labels = trimmed.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return false;
  }
  return true;
}

/**
 * Loose RFC-5321-flavoured email check. Same rationale as
 * `isValidZoneName` — server is authoritative, this only catches
 * typos early.
 */
export function isValidAdminEmail(email: string): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (trimmed.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Format a serial number (RFC 1912 YYYYMMDDNN or plain integer) for
 * display. Falls back to the raw integer if the serial does not
 * match the date-prefixed convention.
 */
export function formatZoneSerial(serial: number | null | undefined): string {
  if (serial === null || serial === undefined) return "—";
  if (!Number.isFinite(serial) || serial < 0) return "—";
  const str = String(Math.trunc(serial));
  if (str.length === 10) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)} #${str.slice(8)}`;
  }
  return str;
}

/**
 * Coerce an API-shaped zone row into the local `ZoneRow` type. Pulled
 * out so tests can assert the date-coercion behaviour without
 * importing JSX.
 */
export function normalizeZoneRow(row: unknown): ZoneRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r["id"] === "string" ? r["id"] : null;
  const name = typeof r["name"] === "string" ? r["name"] : null;
  if (!id || !name) return null;
  return {
    id,
    name,
    adminEmail: typeof r["adminEmail"] === "string" ? r["adminEmail"] : "",
    primaryNs: typeof r["primaryNs"] === "string" ? r["primaryNs"] : "",
    secondaryNs:
      typeof r["secondaryNs"] === "string" ? r["secondaryNs"] : null,
    recordCount:
      typeof r["recordCount"] === "number" ? r["recordCount"] : 0,
    serial: typeof r["serial"] === "number" ? r["serial"] : 0,
    createdAt:
      r["createdAt"] instanceof Date
        ? r["createdAt"]
        : typeof r["createdAt"] === "string"
          ? r["createdAt"]
          : new Date().toISOString(),
  };
}

// ── Page shell ──────────────────────────────────────────────────────

export default function AdminDnsPage(): JSX.Element {
  return (
    <AdminRoute>
      <AdminDnsContent />
    </AdminRoute>
  );
}

// ── Page content ────────────────────────────────────────────────────

function AdminDnsContent(): JSX.Element {
  const navigate = useNavigate();
  const [showForm, setShowForm] = createSignal(false);
  const [pendingCreate, setPendingCreate] = createSignal(false);
  const [pendingDeleteId, setPendingDeleteId] = createSignal<string | null>(
    null,
  );
  const [form, setForm] = createSignal<NewZoneForm>({
    zoneName: "",
    adminEmail: "",
    primaryNs: "",
    secondaryNs: "",
  });
  const [formError, setFormError] = createSignal<string | null>(null);

  const [zones, { refetch }] = createResource(async (): Promise<ZoneRow[]> => {
    const rows = (await trpc.dns.listZones.query()) as unknown[];
    return rows
      .map((r) => normalizeZoneRow(r))
      .filter((r): r is ZoneRow => r !== null);
  });

  const patchForm = (partial: Partial<NewZoneForm>): void => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const resetForm = (): void => {
    setForm({ zoneName: "", adminEmail: "", primaryNs: "", secondaryNs: "" });
    setFormError(null);
  };

  const handleCreate = async (): Promise<void> => {
    const current = form();
    const zoneName = current.zoneName.trim().toLowerCase();
    const adminEmail = current.adminEmail.trim();
    const primaryNs = current.primaryNs.trim().toLowerCase();
    const secondaryNs = current.secondaryNs.trim().toLowerCase();

    if (!isValidZoneName(zoneName)) {
      setFormError("Enter a valid zone name (for example, example.com).");
      return;
    }
    if (!isValidAdminEmail(adminEmail)) {
      setFormError("Enter a valid admin email address.");
      return;
    }
    if (!isValidZoneName(primaryNs)) {
      setFormError("Enter a valid primary nameserver hostname.");
      return;
    }
    if (secondaryNs && !isValidZoneName(secondaryNs)) {
      setFormError(
        "Secondary nameserver is optional, but must be valid if supplied.",
      );
      return;
    }
    setFormError(null);
    setPendingCreate(true);
    try {
      await trpc.dns.createZone.mutate({
        name: zoneName,
        adminEmail,
        primaryNs,
        ...(secondaryNs ? { secondaryNs } : {}),
      });
      showToast(`Zone ${zoneName} created`, "success");
      resetForm();
      setShowForm(false);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to create zone.";
      setFormError(msg);
      showToast(msg, "error");
    } finally {
      setPendingCreate(false);
    }
  };

  const handleDelete = async (zone: ZoneRow): Promise<void> => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Delete zone ${zone.name}? This removes every record it contains.`,
      );
      if (!ok) return;
    }
    setPendingDeleteId(zone.id);
    try {
      await trpc.dns.deleteZone.mutate({ id: zone.id });
      showToast(`Zone ${zone.name} deleted`, "success");
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to delete zone.";
      showToast(msg, "error");
    } finally {
      setPendingDeleteId(null);
    }
  };

  const formatDate = (value: Date | string): string => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Box class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Authoritative DNS - Crontech Admin</Title>

      <Container size="full" padding="md" class="max-w-7xl py-8">
        {/* ── Header ──────────────────────────────────────────── */}
        <Box class="mb-8">
          <Box
            as="nav"
            aria-label="Breadcrumb"
            class="mb-3 flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-faint)" }}
          >
            <A
              href="/admin"
              class="font-medium transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              Admin
            </A>
            <Text as="span" variant="caption" aria-hidden="true">›</Text>
            <Text as="span" variant="caption" class="font-semibold" style={{ color: "var(--color-text)" }}>
              DNS
            </Text>
          </Box>
          <Stack direction="horizontal" justify="between" align="end">
            <Box>
              <Text
                variant="h1"
                class="text-3xl font-bold tracking-tight"
                style={{ color: "var(--color-text)" }}
              >
                Authoritative DNS
              </Text>
              <Text
                variant="body"
                class="mt-1 text-sm"
                style={{ color: "var(--color-text-faint)" }}
              >
                Self-hosted zones powering one-click subdomain creation across
                the platform.
              </Text>
            </Box>
            <button
              type="button"
              onClick={() => {
                setShowForm((v) => !v);
                if (showForm()) resetForm();
              }}
              class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-primary-text)",
              }}
            >
              <span aria-hidden="true">+</span>
              {showForm() ? "Close" : "Add zone"}
            </button>
          </Stack>
        </Box>

        {/* ── Inline add-zone form ────────────────────────────── */}
        <Show when={showForm()}>
          <div
            class="mb-6 rounded-2xl p-6"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div class="mb-4">
              <h2
                class="text-lg font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Add a new zone
              </h2>
              <p
                class="mt-1 text-xs"
                style={{ color: "var(--color-text-faint)" }}
              >
                Crontech becomes authoritative for the zone as soon as it is
                saved. Point the zone's registrar to the nameservers below to
                go live.
              </p>
            </div>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label class="flex flex-col gap-1.5" for="dns-zone-name">
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Zone name
                </span>
                <input
                  id="dns-zone-name"
                  type="text"
                  placeholder="example.com"
                  value={form().zoneName}
                  onInput={(e) =>
                    patchForm({ zoneName: e.currentTarget.value })
                  }
                  class="rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{
                    background: "var(--color-bg-inset)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                />
              </label>
              <label class="flex flex-col gap-1.5" for="dns-admin-email">
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Admin email
                </span>
                <input
                  id="dns-admin-email"
                  type="email"
                  placeholder="hostmaster@example.com"
                  value={form().adminEmail}
                  onInput={(e) =>
                    patchForm({ adminEmail: e.currentTarget.value })
                  }
                  class="rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{
                    background: "var(--color-bg-inset)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                />
              </label>
              <label class="flex flex-col gap-1.5" for="dns-primary-ns">
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Primary nameserver
                </span>
                <input
                  id="dns-primary-ns"
                  type="text"
                  placeholder="ns1.crontech.ai"
                  value={form().primaryNs}
                  onInput={(e) =>
                    patchForm({ primaryNs: e.currentTarget.value })
                  }
                  class="rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{
                    background: "var(--color-bg-inset)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                />
              </label>
              <label class="flex flex-col gap-1.5" for="dns-secondary-ns">
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Secondary nameserver (optional)
                </span>
                <input
                  id="dns-secondary-ns"
                  type="text"
                  placeholder="ns2.crontech.ai"
                  value={form().secondaryNs}
                  onInput={(e) =>
                    patchForm({ secondaryNs: e.currentTarget.value })
                  }
                  class="rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{
                    background: "var(--color-bg-inset)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                />
              </label>
            </div>
            <Show when={formError()}>
              <div
                class="mt-4 rounded-xl px-4 py-3 text-xs"
                style={{
                  background:
                    "color-mix(in oklab, var(--color-danger) 8%, transparent)",
                  color: "var(--color-danger)",
                  border:
                    "1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)",
                }}
              >
                {formError()}
              </div>
            </Show>
            <div class="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                class="rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200"
                style={{
                  background: "var(--color-bg-subtle)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={pendingCreate()}
                class="rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-primary-text)",
                }}
              >
                {pendingCreate() ? "Saving…" : "Create zone"}
              </button>
            </div>
          </div>
        </Show>

        {/* ── Zones table ─────────────────────────────────────── */}
        <div
          class="overflow-hidden rounded-2xl"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            class="grid grid-cols-12 gap-4 px-5 py-3"
            style={{
              background: "var(--color-bg-subtle)",
              "border-bottom": "1px solid var(--color-border)",
            }}
          >
            <span
              class="col-span-4 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Zone
            </span>
            <span
              class="col-span-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Records
            </span>
            <span
              class="col-span-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Serial
            </span>
            <span
              class="col-span-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Created
            </span>
            <span
              class="col-span-2 text-right text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Actions
            </span>
          </div>

          <Show
            when={zones()}
            fallback={
              <div class="flex flex-col items-center gap-2 py-14">
                <div class="loading-spinner" />
                <span
                  class="text-xs"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Loading zones…
                </span>
              </div>
            }
          >
            {(list) => (
              <Show
                when={list().length > 0}
                fallback={
                  <div class="flex flex-col items-center gap-3 py-14 text-center">
                    <span
                      class="text-sm font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      No zones yet
                    </span>
                    <span
                      class="max-w-sm text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Add your first zone to start serving authoritative DNS
                      from Crontech.
                    </span>
                  </div>
                }
              >
                <For each={list()}>
                  {(zone) => (
                    <div
                      class="grid grid-cols-12 items-center gap-4 px-5 py-4 transition-colors"
                      style={{
                        "border-bottom": "1px solid var(--color-border)",
                      }}
                    >
                      <div class="col-span-4 flex min-w-0 flex-col">
                        <span
                          class="truncate text-sm font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          {zone.name}
                        </span>
                        <span
                          class="truncate text-[11px]"
                          style={{ color: "var(--color-text-faint)" }}
                        >
                          {zone.adminEmail || "—"}
                        </span>
                      </div>
                      <span
                        class="col-span-2 text-sm"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {zone.recordCount.toLocaleString()}
                      </span>
                      <span
                        class="col-span-2 truncate font-mono text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {formatZoneSerial(zone.serial)}
                      </span>
                      <span
                        class="col-span-2 text-xs"
                        style={{ color: "var(--color-text-faint)" }}
                      >
                        {formatDate(zone.createdAt)}
                      </span>
                      <div class="col-span-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/dns/${zone.id}`)}
                          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                          style={{
                            background: "var(--color-bg-subtle)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(zone)}
                          disabled={pendingDeleteId() === zone.id}
                          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                          style={{
                            background:
                              "color-mix(in oklab, var(--color-danger) 10%, transparent)",
                            border:
                              "1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)",
                            color: "var(--color-danger)",
                          }}
                        >
                          {pendingDeleteId() === zone.id
                            ? "Deleting…"
                            : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            )}
          </Show>
        </div>
      </Container>
    </Box>
  );
}
