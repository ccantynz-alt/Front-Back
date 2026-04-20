// ── EnvVarsPanel ──────────────────────────────────────────────────────
// Vercel-grade environment variables management UI for a project.
//
// Features:
//   - Clean table showing Key | Value (masked) | Environment | actions
//   - Per-row "masked / hidden" affordance (values are never returned
//     by the server; copy button reminds the user they must re-enter
//     the value to rotate it). Mask/reveal is live in the add/edit form.
//   - "Add environment variable" form with multi-env checkboxes (can
//     target Production + Preview + Development in a single submit).
//   - Bulk import from pasted .env content (parses KEY=VALUE lines,
//     applies chosen environments to every key).
//   - "Copy as .env" exports the key list (values cannot be exported
//     because the server never discloses them; placeholders are used).
//   - Toast feedback on every mutation. No full-page reload.
//
// The backend tRPC surface (setEnvVar, listEnvVars, deleteEnvVar) is
// intentionally untouched — values round-trip only once, on write.

import { createMemo, createSignal, For, Show } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import {
  Badge,
  Button,
  Card,
  Spinner,
  Stack,
  Text,
} from "@back-to-the-future/ui";
import { trpc } from "../lib/trpc";
import { invalidateQueries, useQuery } from "../lib/use-trpc";
import { showToast } from "./Toast";

// ── Types ─────────────────────────────────────────────────────────────

export type EnvTarget = "production" | "preview" | "development";

const ENV_TARGETS: ReadonlyArray<EnvTarget> = [
  "production",
  "preview",
  "development",
];

interface EnvVarRow {
  id: string;
  key: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

interface ParsedEnvLine {
  key: string;
  value: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

function parseEnvFile(raw: string): ParsedEnvLine[] {
  const out: ParsedEnvLine[] = [];
  const lines = raw.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const rawKey = line.slice(0, eq).trim();
    const key = rawKey.startsWith("export ") ? rawKey.slice(7).trim() : rawKey;
    if (!ENV_KEY_RE.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.push({ key, value });
  }
  return out;
}

function relativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Inline icon set (no extra deps) ────────────────────────────────────

function EyeIcon(props: { open: boolean }): JSX.Element {
  return (
    <Show
      when={props.open}
      fallback={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A10.05 10.05 0 0112 4c7 0 11 8 11 8a17.6 17.6 0 01-3.17 4.33M6.12 6.12A17.6 17.6 0 001 12s4 8 11 8a10.05 10.05 0 004.88-1.24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      }
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
      </svg>
    </Show>
  );
}

function CopyIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

// ── Shared Styles ─────────────────────────────────────────────────────

const FIELD_CLASS =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary)] focus:outline-none";

// ── Env Target Multi-Select ───────────────────────────────────────────

function EnvTargetCheckboxes(props: {
  selected: Accessor<ReadonlyArray<EnvTarget>>;
  onToggle: (target: EnvTarget) => void;
}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-2" role="group" aria-label="Environments">
      <For each={ENV_TARGETS}>
        {(target) => {
          const active = (): boolean => props.selected().includes(target);
          return (
            <button
              type="button"
              role="checkbox"
              aria-checked={active()}
              onClick={() => props.onToggle(target)}
              class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                "border-color": active()
                  ? "var(--color-primary)"
                  : "var(--color-border)",
                background: active()
                  ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                  : "var(--color-bg-subtle)",
                color: active()
                  ? "var(--color-primary)"
                  : "var(--color-text-muted)",
              }}
            >
              <span
                aria-hidden="true"
                class="flex h-3.5 w-3.5 items-center justify-center rounded-sm border"
                style={{
                  "border-color": active()
                    ? "var(--color-primary)"
                    : "var(--color-border)",
                  background: active()
                    ? "var(--color-primary)"
                    : "transparent",
                }}
              >
                <Show when={active()}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </Show>
              </span>
              {target}
            </button>
          );
        }}
      </For>
    </div>
  );
}

// ── Add Env Var Form ──────────────────────────────────────────────────

function AddEnvVarForm(props: {
  projectId: string;
  onClose: () => void;
}): JSX.Element {
  const [key, setKey] = createSignal("");
  const [value, setValue] = createSignal("");
  const [reveal, setReveal] = createSignal(false);
  const [targets, setTargets] = createSignal<ReadonlyArray<EnvTarget>>([
    "production",
  ]);
  const [submitting, setSubmitting] = createSignal(false);

  const keyValid = (): boolean => ENV_KEY_RE.test(key().trim());
  const canSubmit = (): boolean =>
    !submitting() &&
    key().trim().length > 0 &&
    value().length > 0 &&
    keyValid() &&
    targets().length > 0;

  const toggleTarget = (t: EnvTarget): void => {
    setTargets((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const submit = async (): Promise<void> => {
    if (!canSubmit()) return;
    setSubmitting(true);
    const k = key().trim();
    const v = value();
    const envs = targets();
    let ok = 0;
    let failed = 0;
    for (const env of envs) {
      try {
        await trpc.projects.setEnvVar.mutate({
          projectId: props.projectId,
          key: k,
          value: v,
          environment: env,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setSubmitting(false);
    if (ok > 0) {
      showToast(
        `Saved ${k} to ${ok} environment${ok === 1 ? "" : "s"}`,
        "success",
      );
      invalidateQueries("projects", "env-vars");
      setKey("");
      setValue("");
      setReveal(false);
      setTargets(["production"]);
      props.onClose();
    }
    if (failed > 0) {
      showToast(
        `Failed to save to ${failed} environment${failed === 1 ? "" : "s"}`,
        "error",
      );
    }
  };

  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <div class="flex items-center justify-between">
          <Text variant="h4" weight="semibold">Add environment variable</Text>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close add form"
            class="rounded-md px-2 py-1 text-xs transition-colors"
            style={{ color: "var(--color-text-faint)" }}
          >
            Cancel
          </button>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              for="env-new-key"
              class="mb-1 block text-xs font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              Key
            </label>
            <input
              id="env-new-key"
              type="text"
              value={key()}
              onInput={(e) => setKey(e.currentTarget.value.toUpperCase())}
              placeholder="DATABASE_URL"
              class={`${FIELD_CLASS} font-mono`}
              style={{ color: "var(--color-text)" }}
              aria-invalid={key().length > 0 && !keyValid()}
            />
            <Show when={key().length > 0 && !keyValid()}>
              <span
                class="mt-1 block text-[11px]"
                style={{ color: "var(--color-danger)" }}
              >
                Must be UPPER_SNAKE_CASE
              </span>
            </Show>
          </div>
          <div>
            <label
              for="env-new-value"
              class="mb-1 block text-xs font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              Value
            </label>
            <div class="relative">
              <input
                id="env-new-value"
                type={reveal() ? "text" : "password"}
                value={value()}
                onInput={(e) => setValue(e.currentTarget.value)}
                placeholder="secret..."
                class={`${FIELD_CLASS} pr-10 font-mono`}
                style={{ color: "var(--color-text)" }}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal() ? "Hide value" : "Show value"}
                class="absolute inset-y-0 right-2 flex items-center rounded-md px-2 transition-colors"
                style={{ color: "var(--color-text-faint)" }}
              >
                <EyeIcon open={reveal()} />
              </button>
            </div>
          </div>
        </div>

        <div>
          <label
            class="mb-2 block text-xs font-medium"
            style={{ color: "var(--color-text-muted)" }}
          >
            Environments
          </label>
          <EnvTargetCheckboxes selected={targets} onToggle={toggleTarget} />
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="md" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!canSubmit()}
            loading={submitting()}
            onClick={() => {
              void submit();
            }}
          >
            Save variable
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

// ── Bulk Import ────────────────────────────────────────────────────────

function BulkImportForm(props: {
  projectId: string;
  onClose: () => void;
}): JSX.Element {
  const [text, setText] = createSignal("");
  const [targets, setTargets] = createSignal<ReadonlyArray<EnvTarget>>([
    "production",
  ]);
  const [submitting, setSubmitting] = createSignal(false);

  const parsed = createMemo((): ParsedEnvLine[] => parseEnvFile(text()));

  const toggleTarget = (t: EnvTarget): void => {
    setTargets((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const canSubmit = (): boolean =>
    !submitting() && parsed().length > 0 && targets().length > 0;

  const submit = async (): Promise<void> => {
    if (!canSubmit()) return;
    setSubmitting(true);
    const rows = parsed();
    const envs = targets();
    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      for (const env of envs) {
        try {
          await trpc.projects.setEnvVar.mutate({
            projectId: props.projectId,
            key: row.key,
            value: row.value,
            environment: env,
          });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
    }
    setSubmitting(false);
    if (ok > 0) {
      showToast(`Imported ${ok} variable${ok === 1 ? "" : "s"}`, "success");
      invalidateQueries("projects", "env-vars");
      setText("");
      props.onClose();
    }
    if (failed > 0) {
      showToast(
        `Failed to import ${failed} entr${failed === 1 ? "y" : "ies"}`,
        "error",
      );
    }
  };

  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <div class="flex items-center justify-between">
          <div>
            <Text variant="h4" weight="semibold">Bulk import from .env</Text>
            <Text
              variant="caption"
              style={{ color: "var(--color-text-faint)" }}
            >
              Paste the contents of a .env file. Lines starting with # are skipped.
            </Text>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close import form"
            class="rounded-md px-2 py-1 text-xs transition-colors"
            style={{ color: "var(--color-text-faint)" }}
          >
            Cancel
          </button>
        </div>

        <textarea
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=sk-..."}
          aria-label="Bulk .env content"
          rows={8}
          spellcheck={false}
          class={`${FIELD_CLASS} font-mono`}
          style={{ color: "var(--color-text)", "min-height": "160px" }}
        />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <Text variant="caption" style={{ color: "var(--color-text-muted)" }}>
            {parsed().length} variable{parsed().length === 1 ? "" : "s"} detected
          </Text>
          <EnvTargetCheckboxes selected={targets} onToggle={toggleTarget} />
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="md" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!canSubmit()}
            loading={submitting()}
            onClick={() => {
              void submit();
            }}
          >
            Import {parsed().length} variable{parsed().length === 1 ? "" : "s"}
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

// ── Env Var Row ────────────────────────────────────────────────────────

function EnvVarRowItem(props: {
  projectId: string;
  row: EnvVarRow;
}): JSX.Element {
  const [revealed, setRevealed] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);

  const mask = "••••••••••••";

  const handleCopyKey = async (): Promise<void> => {
    const ok = await copyToClipboard(props.row.key);
    showToast(
      ok ? `Copied key ${props.row.key}` : "Copy failed — clipboard blocked",
      ok ? "success" : "error",
    );
  };

  const handleDelete = async (): Promise<void> => {
    if (deleting()) return;
    setDeleting(true);
    try {
      await trpc.projects.deleteEnvVar.mutate({
        projectId: props.projectId,
        envVarId: props.row.id,
      });
      showToast(`Deleted ${props.row.key}`, "success");
      invalidateQueries("projects", "env-vars");
    } catch (err) {
      setDeleting(false);
      showToast(
        err instanceof Error ? err.message : "Failed to delete variable",
        "error",
      );
    }
  };

  return (
    <Card padding="sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <span
            class="truncate font-mono text-sm"
            style={{ color: "var(--color-text)" }}
            title={props.row.key}
          >
            {props.row.key}
          </span>
          <Badge variant="default" size="sm">{props.row.environment}</Badge>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            class="hidden select-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-2 py-1 font-mono text-xs sm:inline-block"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Masked value"
            title="Value is encrypted. Re-enter to rotate."
          >
            {revealed() ? "(encrypted — not retrievable)" : mask}
          </span>
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed() ? "Hide value placeholder" : "Show value placeholder"}
            class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            <EyeIcon open={revealed()} />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyKey();
            }}
            aria-label={`Copy key ${props.row.key}`}
            class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            <CopyIcon />
          </button>
          <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
            {relativeTime(props.row.updatedAt)}
          </Text>
          <button
            type="button"
            onClick={() => {
              void handleDelete();
            }}
            disabled={deleting()}
            aria-label={`Delete ${props.row.key}`}
            class="flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
            style={{
              "border-color": "var(--color-border)",
              color: "var(--color-danger)",
              opacity: deleting() ? "0.5" : "1",
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Public Panel ──────────────────────────────────────────────────────

export interface EnvVarsPanelProps {
  projectId: string;
}

export function EnvVarsPanel(props: EnvVarsPanelProps): JSX.Element {
  const [showAdd, setShowAdd] = createSignal(false);
  const [showImport, setShowImport] = createSignal(false);

  const query = useQuery(
    () => trpc.projects.listEnvVars.query({ projectId: props.projectId }),
    { key: ["projects", "env-vars"] },
  );

  const rows = createMemo((): EnvVarRow[] => {
    const data = query.data();
    if (!data) return [];
    return data
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key));
  });

  const totalCount = (): number => rows().length;

  const handleCopyAsEnv = async (): Promise<void> => {
    const list = rows();
    if (list.length === 0) {
      showToast("No variables to export yet", "info");
      return;
    }
    // We cannot emit real values (backend never returns them). Emit
    // keys with a "REDACTED" marker so the user knows the shape.
    const lines: string[] = [];
    lines.push("# Exported from Crontech — values are redacted.");
    lines.push("# Re-enter secrets in the Crontech dashboard to rotate.");
    for (const row of list) {
      lines.push(`# env: ${row.environment}`);
      lines.push(`${row.key}=REDACTED`);
    }
    const ok = await copyToClipboard(`${lines.join("\n")}\n`);
    showToast(
      ok
        ? `Copied ${list.length} variable${list.length === 1 ? "" : "s"} as .env`
        : "Copy failed — clipboard blocked",
      ok ? "success" : "error",
    );
  };

  return (
    <Stack direction="vertical" gap="lg">
      {/* Toolbar */}
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text variant="h4" weight="semibold">Environment variables</Text>
          <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
            Encrypted at rest. Values are never returned by the API once saved.
            {totalCount() > 0 ? ` • ${totalCount()} variable${totalCount() === 1 ? "" : "s"}` : ""}
          </Text>
        </div>
        <Stack direction="horizontal" gap="sm">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleCopyAsEnv();
            }}
            aria-label="Copy variables as .env"
          >
            Copy as .env
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowImport((v) => !v);
              if (!showImport()) setShowAdd(false);
            }}
          >
            Bulk import
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowAdd((v) => !v);
              if (!showAdd()) setShowImport(false);
            }}
          >
            <span class="inline-flex items-center gap-1.5">
              <PlusIcon />
              Add variable
            </span>
          </Button>
        </Stack>
      </div>

      {/* Add form */}
      <Show when={showAdd()}>
        <AddEnvVarForm
          projectId={props.projectId}
          onClose={() => setShowAdd(false)}
        />
      </Show>

      {/* Import form */}
      <Show when={showImport()}>
        <BulkImportForm
          projectId={props.projectId}
          onClose={() => setShowImport(false)}
        />
      </Show>

      {/* Loading state */}
      <Show
        when={!query.loading}
        fallback={
          <Card padding="lg">
            <div class="flex items-center justify-center gap-3 py-6">
              <Spinner size="md" />
              <Text variant="body" style={{ color: "var(--color-text-muted)" }}>
                Loading environment variables…
              </Text>
            </div>
          </Card>
        }
      >
        <Show
          when={rows().length > 0}
          fallback={
            <Card padding="lg">
              <Stack direction="vertical" gap="sm" class="items-center py-4">
                <Text
                  variant="body"
                  class="text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No environment variables yet.
                </Text>
                <Text
                  variant="caption"
                  class="text-center"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Values are encrypted at rest and scoped per environment.
                </Text>
                <div class="mt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowAdd(true)}
                  >
                    <span class="inline-flex items-center gap-1.5">
                      <PlusIcon />
                      Add your first variable
                    </span>
                  </Button>
                </div>
              </Stack>
            </Card>
          }
        >
          <div class="space-y-2">
            <For each={rows()}>
              {(row) => (
                <EnvVarRowItem projectId={props.projectId} row={row} />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </Stack>
  );
}
