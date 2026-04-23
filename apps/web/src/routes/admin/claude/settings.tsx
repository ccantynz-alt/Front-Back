// ── /admin/claude/settings ──────────────────────────────────────────
// Admin-only Claude console settings page. Lets the admin paste /
// rotate the Anthropic API key (masked after save), pick the default
// Claude model, and persist a system-prompt preset.
//
// The API key is round-tripped via the existing tRPC procs on
// chatRouter (saveProviderKey / getProviderKey / deleteProviderKey).
// Default model + system prompt live in localStorage (UI-only state
// with no privacy implications) — keys:
//   btf:admin:claude:defaultModel
//   btf:admin:claude:systemPrompt
//
// Tone is polite. No named competitors. Zero raw HTML — SolidJS JSX
// + shared UI primitives only. AI-composable: every section is a
// named component with props explicit at the top.

import { Title } from "@solidjs/meta";
import { createSignal, createResource, Show, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  Button,
  Card,
  Input,
  Select,
  Stack,
  Text,
  Textarea,
  Badge,
  Spinner,
} from "@back-to-the-future/ui";
import { AdminRoute } from "../../../components/AdminRoute";
import { trpc } from "../../../lib/trpc";
import { showToast } from "../../../components/Toast";

// ── Model catalog ─────────────────────────────────────────────────
// Mirror of `@back-to-the-future/ai-core`'s `ANTHROPIC_MODELS`. The
// ai-core package's barrel transitively pulls server-only Mastra
// modules into the client bundle, so the admin console carries its
// own copy keyed by the same model IDs. Canonical source:
// `packages/ai-core/src/providers.ts` → `ANTHROPIC_MODELS`. If the
// shared catalog grows, update both.

const ANTHROPIC_MODELS = {
  "claude-opus-4-7": { name: "Claude Opus 4.7" },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
  "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5" },
} as const;

type AnthropicModelId = keyof typeof ANTHROPIC_MODELS;

// ── LocalStorage keys (exported so tests can assert stability) ────

export const STORAGE_KEY_DEFAULT_MODEL = "btf:admin:claude:defaultModel";
export const STORAGE_KEY_SYSTEM_PROMPT = "btf:admin:claude:systemPrompt";

// ── Pure helpers (exported for unit tests) ────────────────────────

/**
 * Mask an Anthropic API key for display after save.
 *
 * Keeps the first 12 characters (enough to identify the key family
 * `sk-ant-api03` etc.) and appends an ellipsis followed by asterisks
 * so the viewer knows the rest is redacted. We deliberately render a
 * fixed number of asterisks so the DOM cannot be used to infer the
 * original key length.
 */
export function maskAnthropicKey(apiKey: string): string {
  const head = apiKey.slice(0, 12);
  const tail = "*".repeat(20);
  return `${head}...${tail}`;
}

/**
 * Turn the ANTHROPIC_MODELS catalog into `<Select>` options.
 * Pure function so the test suite can assert coverage parity.
 */
export function modelSelectOptions(): { value: string; label: string }[] {
  return Object.entries(ANTHROPIC_MODELS).map(([id, info]) => ({
    value: id,
    label: info.name,
  }));
}

/** Default model id to select when the user has no prior choice. */
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = "claude-sonnet-4-6";

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Non-fatal: localStorage may be unavailable (private mode, quota).
  }
}

// ── Default export: the route ─────────────────────────────────────

export default function AdminClaudeSettingsPage(): JSX.Element {
  return (
    <AdminRoute>
      <AdminClaudeSettingsContent />
    </AdminRoute>
  );
}

// ── Breadcrumb ─────────────────────────────────────────────────────

function Breadcrumb(): JSX.Element {
  const navigate = useNavigate();
  const linkClass =
    "text-sm font-medium transition-colors hover:text-[var(--color-text)]";
  return (
    <nav
      aria-label="Breadcrumb"
      class="flex items-center gap-2 text-sm"
      style={{ color: "var(--color-text-muted)" }}
    >
      <button
        type="button"
        class={linkClass}
        onClick={() => navigate("/admin")}
      >
        Admin
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        class={linkClass}
        onClick={() => navigate("/admin/claude")}
      >
        Claude
      </button>
      <span aria-hidden="true">/</span>
      <span style={{ color: "var(--color-text)" }}>Settings</span>
    </nav>
  );
}

// ── API Key Card ──────────────────────────────────────────────────

interface ApiKeyCardProps {
  maskedKey: string | null;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: (apiKey: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function ApiKeyCard(props: ApiKeyCardProps): JSX.Element {
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const handleSave = async (): Promise<void> => {
    const raw = input().trim();
    setError(null);
    if (raw.length < 10) {
      setError("Please paste a full Anthropic API key.");
      return;
    }
    if (!raw.startsWith("sk-ant-")) {
      setError("Anthropic keys begin with sk-ant-. Please double-check what you pasted.");
      return;
    }
    await props.onSave(raw);
    setInput("");
  };

  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Stack direction="vertical" gap="xs">
          <Text variant="h3" weight="semibold">
            Anthropic API key
          </Text>
          <Text variant="body" class="text-muted">
            Paste a personal Anthropic API key. The console uses this key to stream
            Claude responses on your behalf. The key is stored encrypted at rest.
          </Text>
        </Stack>

        <Show
          when={!props.loading}
          fallback={
            <Stack direction="horizontal" gap="sm" align="center">
              <Spinner />
              <Text variant="caption" class="text-muted">
                Checking for an existing key...
              </Text>
            </Stack>
          }
        >
          <Show
            when={props.maskedKey}
            fallback={
              <Stack direction="vertical" gap="sm">
                <Input
                  label="API key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={input()}
                  onInput={(e) => setInput(e.currentTarget.value)}
                  {...(error() ? { error: error() as string } : {})}
                />
                <Stack direction="horizontal" gap="sm">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleSave}
                    disabled={props.saving || input().trim().length === 0}
                    loading={props.saving}
                  >
                    Save key
                  </Button>
                </Stack>
              </Stack>
            }
          >
            <Stack direction="vertical" gap="sm">
              <Stack direction="horizontal" gap="sm" align="center">
                <Badge variant="success" size="sm">
                  Connected
                </Badge>
                <Text variant="body" class="text-muted">
                  {props.maskedKey}
                </Text>
              </Stack>
              <Text variant="caption" class="text-muted">
                To rotate the key, remove the current one and paste a new value.
              </Text>
              <Stack direction="horizontal" gap="sm">
                <Button
                  variant="destructive"
                  size="md"
                  onClick={props.onDelete}
                  disabled={props.deleting}
                  loading={props.deleting}
                >
                  Remove key
                </Button>
              </Stack>
            </Stack>
          </Show>
        </Show>
      </Stack>
    </Card>
  );
}

// ── Model Picker Card ─────────────────────────────────────────────

interface ModelPickerCardProps {
  value: string;
  onChange: (model: string) => void;
}

function ModelPickerCard(props: ModelPickerCardProps): JSX.Element {
  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Stack direction="vertical" gap="xs">
          <Text variant="h3" weight="semibold">
            Default model
          </Text>
          <Text variant="body" class="text-muted">
            The default Claude model used when a new conversation is started.
            Your choice is remembered in this browser.
          </Text>
        </Stack>
        <Select
          name="default-model"
          label="Model"
          value={props.value}
          options={modelSelectOptions()}
          onChange={(next) => props.onChange(next)}
        />
      </Stack>
    </Card>
  );
}

// ── System Prompt Card ────────────────────────────────────────────

interface SystemPromptCardProps {
  value: string;
  onChange: (prompt: string) => void;
}

function SystemPromptCard(props: SystemPromptCardProps): JSX.Element {
  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Stack direction="vertical" gap="xs">
          <Text variant="h3" weight="semibold">
            System prompt preset
          </Text>
          <Text variant="body" class="text-muted">
            Optional system prompt prepended to new conversations. Use it to set
            tone, role, or house style. Stored locally in this browser.
          </Text>
        </Stack>
        <Textarea
          label="System prompt"
          rows={8}
          value={props.value}
          placeholder="You are a precise, friendly engineering assistant..."
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      </Stack>
    </Card>
  );
}

// ── Page content ──────────────────────────────────────────────────

function AdminClaudeSettingsContent(): JSX.Element {
  // Provider key state
  const [savedPrefix, setSavedPrefix] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);

  // Resource: fetch existing key info on mount (prefix only).
  const [existing, { refetch }] = createResource(async () => {
    try {
      return await trpc.chat.getProviderKey.query({ provider: "anthropic" });
    } catch {
      return null;
    }
  });

  // When existing resolves, seed savedPrefix with a masked representation.
  // We only have the prefix on the server, so we reuse what the server
  // already computed (e.g. "sk-ant-a...abcd") when no fresh save has set
  // a fuller mask.
  const maskedKey = (): string | null => {
    const local = savedPrefix();
    if (local) return local;
    const row = existing();
    return row?.prefix ?? null;
  };

  const handleSave = async (apiKey: string): Promise<void> => {
    setSaving(true);
    try {
      await trpc.chat.saveProviderKey.mutate({ provider: "anthropic", apiKey });
      setSavedPrefix(maskAnthropicKey(apiKey));
      showToast("Anthropic key saved.", "success");
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save the key.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      await trpc.chat.deleteProviderKey.mutate({ provider: "anthropic" });
      setSavedPrefix(null);
      showToast("Anthropic key removed.", "success");
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not remove the key.";
      showToast(msg, "error");
    } finally {
      setDeleting(false);
    }
  };

  // Default-model state, persisted in localStorage.
  const initialModel = readLocalStorage(STORAGE_KEY_DEFAULT_MODEL) ?? DEFAULT_ANTHROPIC_MODEL;
  const [defaultModel, setDefaultModel] = createSignal<string>(initialModel);

  const handleChangeModel = (next: string): void => {
    setDefaultModel(next);
    writeLocalStorage(STORAGE_KEY_DEFAULT_MODEL, next);
    showToast("Default model updated.", "success");
  };

  // System-prompt state, persisted in localStorage.
  const initialPrompt = readLocalStorage(STORAGE_KEY_SYSTEM_PROMPT) ?? "";
  const [systemPrompt, setSystemPrompt] = createSignal<string>(initialPrompt);

  const handleChangePrompt = (next: string): void => {
    setSystemPrompt(next);
    writeLocalStorage(STORAGE_KEY_SYSTEM_PROMPT, next);
  };

  return (
    <>
      <Title>Claude Settings - Admin - Crontech</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Breadcrumb />
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Claude console settings
          </Text>
          <Text variant="body" class="text-muted">
            Manage the Anthropic API key, default model, and system prompt used
            by the admin Claude console.
          </Text>
        </Stack>

        <ApiKeyCard
          maskedKey={maskedKey()}
          loading={existing.loading}
          saving={saving()}
          deleting={deleting()}
          onSave={handleSave}
          onDelete={handleDelete}
        />

        <ModelPickerCard value={defaultModel()} onChange={handleChangeModel} />

        <SystemPromptCard value={systemPrompt()} onChange={handleChangePrompt} />
      </Stack>
    </>
  );
}
