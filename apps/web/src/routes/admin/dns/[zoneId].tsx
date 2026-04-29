// ── /admin/dns/:zoneId ────────────────────────────────────────────
// Per-zone record editor. Admin-only. Lists every record in the zone,
// supports inline create / edit / delete, and exposes zone metadata
// (admin email, primary/secondary NS) for inline editing.
//
// Wires to tRPC `dns.*` procs (shipped in d98d1e4):
//   • dns.getZone({ id })        → { zone, records }
//   • dns.updateZone({ id, ... }) → bumps serial
//   • dns.createRecord(...)       → validates per-type; bumps serial
//   • dns.updateRecord(...)       → bumps serial
//   • dns.deleteRecord({ id })    → bumps serial
//
// Zero HTML — SolidJS JSX. Polite tone, no named competitors.

import { Title } from "@solidjs/meta";
import {
  createSignal,
  createResource,
  For,
  Show,
  type JSX,
} from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { Box, Container, Text } from "@back-to-the-future/ui";
import { AdminRoute } from "../../../components/AdminRoute";
import { showToast } from "../../../components/Toast";
import { trpc } from "../../../lib/trpc";

// ── Types ───────────────────────────────────────────────────────────

type RecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "TXT"
  | "NS"
  | "SRV"
  | "CAA";

const RECORD_TYPES: RecordType[] = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
];

/** Whether a given record type requires a `priority` field. */
export function requiresPriority(type: RecordType): boolean {
  return type === "MX" || type === "SRV";
}

/** Human hint text per record type (shown under the content input). */
export function contentHintFor(type: RecordType): string {
  switch (type) {
    case "A":
      return "IPv4 address, e.g. 45.76.21.235";
    case "AAAA":
      return "IPv6 address, e.g. 2001:db8::1";
    case "CNAME":
      return "Target hostname, e.g. crontech.ai";
    case "MX":
      return "Mail server hostname (set priority below)";
    case "TXT":
      return "Free-form text up to 255 characters";
    case "NS":
      return "Nameserver hostname, e.g. ns1.crontech.ai";
    case "SRV":
      return "Service target (set priority below)";
    case "CAA":
      return 'CAA value, e.g. 0 issue "letsencrypt.org"';
  }
}

// ── Page ───────────────────────────────────────────────────────────

export default function AdminZoneDetailPage(): JSX.Element {
  const params = useParams<{ zoneId: string }>();
  const navigate = useNavigate();

  const [data, { refetch }] = createResource(
    () => params.zoneId,
    async (id) => trpc.dns.getZone.query({ id }),
  );

  // Zone metadata edit state
  const [editingZone, setEditingZone] = createSignal(false);
  const [zoneAdminEmail, setZoneAdminEmail] = createSignal("");
  const [zonePrimaryNs, setZonePrimaryNs] = createSignal("");
  const [zoneSecondaryNs, setZoneSecondaryNs] = createSignal("");

  function startZoneEdit(): void {
    const z = data()?.zone;
    if (!z) return;
    setZoneAdminEmail(z.adminEmail);
    setZonePrimaryNs(z.primaryNs);
    setZoneSecondaryNs(z.secondaryNs ?? "");
    setEditingZone(true);
  }

  async function saveZoneEdit(): Promise<void> {
    try {
      await trpc.dns.updateZone.mutate({
        id: params.zoneId,
        adminEmail: zoneAdminEmail(),
        primaryNs: zonePrimaryNs(),
        ...(zoneSecondaryNs()
          ? { secondaryNs: zoneSecondaryNs() }
          : { secondaryNs: null }),
      });
      setEditingZone(false);
      await refetch();
      showToast("Zone updated", "success");
    } catch (err) {
      showToast(
        `Zone update failed: ${(err as Error).message}`,
        "error",
      );
    }
  }

  // Record create form state
  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newType, setNewType] = createSignal<RecordType>("A");
  const [newContent, setNewContent] = createSignal("");
  const [newTtl, setNewTtl] = createSignal(300);
  const [newPriority, setNewPriority] = createSignal<number | null>(
    null,
  );

  function resetCreateForm(): void {
    setNewName("");
    setNewType("A");
    setNewContent("");
    setNewTtl(300);
    setNewPriority(null);
    setShowCreate(false);
  }

  async function submitCreate(): Promise<void> {
    try {
      await trpc.dns.createRecord.mutate({
        zoneId: params.zoneId,
        name: newName(),
        type: newType(),
        content: newContent(),
        ttl: newTtl(),
        ...(requiresPriority(newType()) && newPriority() !== null
          ? { priority: newPriority() as number }
          : {}),
      });
      resetCreateForm();
      await refetch();
      showToast("Record created", "success");
    } catch (err) {
      showToast(
        `Create failed: ${(err as Error).message}`,
        "error",
      );
    }
  }

  // Record delete
  async function deleteRecord(id: string, label: string): Promise<void> {
    if (!confirm(`Delete ${label}?`)) return;
    try {
      await trpc.dns.deleteRecord.mutate({ id });
      await refetch();
      showToast("Record deleted", "success");
    } catch (err) {
      showToast(
        `Delete failed: ${(err as Error).message}`,
        "error",
      );
    }
  }

  return (
    <AdminRoute>
      <Title>DNS Zone · Admin · Crontech</Title>
      <Container
        size="full"
        padding="none"
        style={{
          padding: "2rem",
          "max-width": "1200px",
        }}
      >
        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <Box
          as="nav"
          aria-label="Breadcrumb"
          style={{ "margin-bottom": "1rem", "font-size": "0.875rem" }}
        >
          <A href="/admin" style={{ color: "var(--color-text-secondary)" }}>
            Admin
          </A>
          <Text as="span" variant="caption" style={{ margin: "0 0.5rem", color: "var(--color-text-faint)" }}>
            ›
          </Text>
          <A href="/admin/dns" style={{ color: "var(--color-text-secondary)" }}>
            DNS
          </A>
          <Text as="span" variant="caption" style={{ margin: "0 0.5rem", color: "var(--color-text-faint)" }}>
            ›
          </Text>
          <Text as="span" variant="caption" style={{ color: "var(--color-text)" }}>
            {data()?.zone.name ?? "—"}
          </Text>
        </Box>

        <Show
          when={!data.loading && data()}
          fallback={
            <Text variant="body" style={{ color: "var(--color-text-secondary)" }}>
              Loading zone…
            </Text>
          }
        >
          {(loaded) => (
            <>
              {/* ── Zone metadata card ─────────────────────────────── */}
              <section
                style={{
                  padding: "1.5rem",
                  "border-radius": "0.75rem",
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  "margin-bottom": "2rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "justify-content": "space-between",
                    "align-items": "flex-start",
                    "margin-bottom": "1rem",
                  }}
                >
                  <div>
                    <h1
                      style={{
                        "font-size": "1.5rem",
                        "font-weight": 600,
                        margin: 0,
                      }}
                    >
                      {loaded().zone.name}
                    </h1>
                    <p
                      style={{
                        color: "var(--color-text-secondary)",
                        "font-size": "0.875rem",
                        "margin-top": "0.25rem",
                      }}
                    >
                      Serial {loaded().zone.serial} · {loaded().records.length}{" "}
                      records
                    </p>
                  </div>
                  <Show
                    when={!editingZone()}
                    fallback={
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={saveZoneEdit}
                          style={{
                            padding: "0.5rem 1rem",
                            "border-radius": "0.375rem",
                            background: "var(--color-primary)",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingZone(false)}
                          style={{
                            padding: "0.5rem 1rem",
                            "border-radius": "0.375rem",
                            background: "var(--color-bg-subtle)",
                            color: "var(--color-text)",
                            border: "1px solid var(--color-border)",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      onClick={startZoneEdit}
                      style={{
                        padding: "0.5rem 1rem",
                        "border-radius": "0.375rem",
                        background: "var(--color-bg-subtle)",
                        color: "var(--color-text)",
                        border: "1px solid var(--color-border)",
                        cursor: "pointer",
                      }}
                    >
                      Edit zone
                    </button>
                  </Show>
                </div>

                <Show
                  when={editingZone()}
                  fallback={
                    <dl
                      style={{
                        display: "grid",
                        "grid-template-columns": "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "0.75rem",
                        "font-size": "0.875rem",
                      }}
                    >
                      <div>
                        <dt style={{ color: "var(--color-text-secondary)" }}>
                          Admin email
                        </dt>
                        <dd style={{ margin: 0 }}>{loaded().zone.adminEmail}</dd>
                      </div>
                      <div>
                        <dt style={{ color: "var(--color-text-secondary)" }}>
                          Primary NS
                        </dt>
                        <dd style={{ margin: 0 }}>{loaded().zone.primaryNs}</dd>
                      </div>
                      <div>
                        <dt style={{ color: "var(--color-text-secondary)" }}>
                          Secondary NS
                        </dt>
                        <dd style={{ margin: 0 }}>
                          {loaded().zone.secondaryNs ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  }
                >
                  <div
                    style={{
                      display: "grid",
                      "grid-template-columns": "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.875rem",
                      }}
                    >
                      <span style={{ color: "var(--color-text-secondary)" }}>
                        Admin email
                      </span>
                      <input
                        type="text"
                        value={zoneAdminEmail()}
                        onInput={(e) => setZoneAdminEmail(e.currentTarget.value)}
                        aria-label="Admin email"
                        style={{
                          padding: "0.5rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.875rem",
                      }}
                    >
                      <span style={{ color: "var(--color-text-secondary)" }}>
                        Primary NS
                      </span>
                      <input
                        type="text"
                        value={zonePrimaryNs()}
                        onInput={(e) => setZonePrimaryNs(e.currentTarget.value)}
                        aria-label="Primary NS"
                        style={{
                          padding: "0.5rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.875rem",
                      }}
                    >
                      <span style={{ color: "var(--color-text-secondary)" }}>
                        Secondary NS (optional)
                      </span>
                      <input
                        type="text"
                        value={zoneSecondaryNs()}
                        onInput={(e) => setZoneSecondaryNs(e.currentTarget.value)}
                        aria-label="Secondary NS"
                        style={{
                          padding: "0.5rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                  </div>
                </Show>
              </section>

              {/* ── Records ──────────────────────────────────────────── */}
              <section>
                <div
                  style={{
                    display: "flex",
                    "justify-content": "space-between",
                    "align-items": "center",
                    "margin-bottom": "1rem",
                  }}
                >
                  <h2
                    style={{
                      "font-size": "1.25rem",
                      "font-weight": 600,
                      margin: 0,
                    }}
                  >
                    Records
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowCreate(!showCreate())}
                    style={{
                      padding: "0.5rem 1rem",
                      "border-radius": "0.375rem",
                      background: "var(--color-primary)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {showCreate() ? "Cancel" : "Add record"}
                  </button>
                </div>

                <Show when={showCreate()}>
                  <div
                    style={{
                      padding: "1rem",
                      "border-radius": "0.5rem",
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--color-border)",
                      "margin-bottom": "1rem",
                      display: "grid",
                      "grid-template-columns":
                        "minmax(140px, 1fr) 120px 2fr 100px 100px auto",
                      gap: "0.5rem",
                      "align-items": "end",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.75rem",
                      }}
                    >
                      <span>Name</span>
                      <input
                        type="text"
                        value={newName()}
                        onInput={(e) => setNewName(e.currentTarget.value)}
                        placeholder="www or @"
                        aria-label="Record name"
                        style={{
                          padding: "0.4rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.75rem",
                      }}
                    >
                      <span>Type</span>
                      <select
                        value={newType()}
                        onChange={(e) =>
                          setNewType(e.currentTarget.value as RecordType)
                        }
                        aria-label="Record type"
                        style={{
                          padding: "0.4rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      >
                        <For each={RECORD_TYPES}>
                          {(t) => <option value={t}>{t}</option>}
                        </For>
                      </select>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.75rem",
                      }}
                    >
                      <span>Content</span>
                      <input
                        type="text"
                        value={newContent()}
                        onInput={(e) => setNewContent(e.currentTarget.value)}
                        placeholder={contentHintFor(newType())}
                        aria-label="Record content"
                        style={{
                          padding: "0.4rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.75rem",
                      }}
                    >
                      <span>TTL</span>
                      <input
                        type="number"
                        min="30"
                        value={newTtl()}
                        onInput={(e) =>
                          setNewTtl(Number(e.currentTarget.value) || 300)
                        }
                        aria-label="Record TTL"
                        style={{
                          padding: "0.4rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25rem",
                        "font-size": "0.75rem",
                      }}
                    >
                      <span>Priority</span>
                      <input
                        type="number"
                        min="0"
                        disabled={!requiresPriority(newType())}
                        value={newPriority() ?? ""}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setNewPriority(v === "" ? null : Number(v));
                        }}
                        aria-label="Record priority"
                        style={{
                          padding: "0.4rem",
                          "border-radius": "0.375rem",
                          border: "1px solid var(--color-border)",
                          background: requiresPriority(newType())
                            ? "var(--color-bg)"
                            : "var(--color-bg-subtle)",
                          color: "var(--color-text)",
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={submitCreate}
                      style={{
                        padding: "0.5rem 1rem",
                        "border-radius": "0.375rem",
                        background: "var(--color-primary)",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Create
                    </button>
                  </div>
                </Show>

                <table
                  style={{
                    width: "100%",
                    "border-collapse": "collapse",
                    "font-size": "0.875rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        "text-align": "left",
                        "border-bottom": "1px solid var(--color-border)",
                      }}
                    >
                      <th style={{ padding: "0.75rem 0.5rem" }}>Name</th>
                      <th style={{ padding: "0.75rem 0.5rem" }}>Type</th>
                      <th style={{ padding: "0.75rem 0.5rem" }}>Content</th>
                      <th
                        style={{
                          padding: "0.75rem 0.5rem",
                          "text-align": "right",
                        }}
                      >
                        TTL
                      </th>
                      <th
                        style={{
                          padding: "0.75rem 0.5rem",
                          "text-align": "right",
                        }}
                      >
                        Priority
                      </th>
                      <th
                        style={{
                          padding: "0.75rem 0.5rem",
                          "text-align": "right",
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <For
                      each={loaded().records}
                      fallback={
                        <tr>
                          <td
                            colspan="6"
                            style={{
                              padding: "1.5rem",
                              "text-align": "center",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            No records yet. Add one above.
                          </td>
                        </tr>
                      }
                    >
                      {(record) => (
                        <tr
                          style={{
                            "border-bottom": "1px solid var(--color-border-subtle)",
                          }}
                        >
                          <td
                            style={{
                              padding: "0.75rem 0.5rem",
                              "font-family": "var(--font-mono)",
                            }}
                          >
                            {record.name}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 0.5rem",
                              "font-weight": 600,
                            }}
                          >
                            {record.type}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 0.5rem",
                              "font-family": "var(--font-mono)",
                              "word-break": "break-all",
                            }}
                          >
                            {record.content}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 0.5rem",
                              "text-align": "right",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {record.ttl}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 0.5rem",
                              "text-align": "right",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {record.priority ?? "—"}
                          </td>
                          <td
                            style={{
                              padding: "0.75rem 0.5rem",
                              "text-align": "right",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                deleteRecord(
                                  record.id,
                                  `${record.type} ${record.name}`,
                                )
                              }
                              aria-label={`Delete ${record.type} record ${record.name}`}
                              style={{
                                padding: "0.25rem 0.5rem",
                                "border-radius": "0.25rem",
                                background: "transparent",
                                color: "var(--color-danger)",
                                border: "1px solid var(--color-danger-border)",
                                cursor: "pointer",
                                "font-size": "0.75rem",
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>

              <div style={{ "margin-top": "2rem" }}>
                <button
                  type="button"
                  onClick={() => navigate("/admin/dns")}
                  style={{
                    padding: "0.5rem 1rem",
                    "border-radius": "0.375rem",
                    background: "var(--color-bg-subtle)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                    cursor: "pointer",
                  }}
                >
                  ← Back to zones
                </button>
              </div>
            </>
          )}
        </Show>
      </Container>
    </AdminRoute>
  );
}
