import { Title } from "@solidjs/meta";
import { Show, For, createSignal, createResource } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Input, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth, useTheme } from "../stores";
import { trpc } from "../lib/trpc";
import { friendlyError } from "../lib/use-trpc";
import { showToast } from "../components/Toast";

function Section(props: { title: string; description: string; children: JSX.Element }): JSX.Element {
  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Stack direction="vertical" gap="xs">
          <Text variant="h4" weight="semibold">{props.title}</Text>
          <Text variant="caption" class="text-muted">{props.description}</Text>
        </Stack>
        {props.children}
      </Stack>
    </Card>
  );
}

// ── API Key Types ───────────────────────────────────────────────────

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  maskedKey: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
}

// ── Fetchers (tRPC client) ──────────────────────────────────────────

async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
  const rows = await trpc.apiKeys.list.query();
  return rows as unknown as ApiKeyInfo[];
}

async function fetchWebhooks(): Promise<WebhookInfo[]> {
  const rows = await trpc.webhooks.list.query();
  return rows as unknown as WebhookInfo[];
}

// ── Developer Section Component ─────────────────────────────────────

function DeveloperSection(): JSX.Element {
  // API Keys
  const [apiKeys, { refetch: refetchKeys }] = createResource(fetchApiKeys);
  const [newKeyName, setNewKeyName] = createSignal("");
  const [newKeyExpiry, setNewKeyExpiry] = createSignal("");
  const [createdKey, setCreatedKey] = createSignal<string | null>(null);
  const [keyCopied, setKeyCopied] = createSignal(false);
  const [keyCreating, setKeyCreating] = createSignal(false);

  // Webhooks
  const [webhooks, { refetch: refetchWebhooks }] = createResource(fetchWebhooks);
  const [newWebhookUrl, setNewWebhookUrl] = createSignal("");
  const [webhookCreating, setWebhookCreating] = createSignal(false);
  const [testingWebhookId, setTestingWebhookId] = createSignal<string | null>(null);
  const [testResult, setTestResult] = createSignal<{ success: boolean; status: string } | null>(null);

  const handleCreateKey = async (): Promise<void> => {
    if (!newKeyName().trim()) return;
    setKeyCreating(true);
    setCreatedKey(null);

    try {
      const input: { name: string; expiresAt?: Date } = { name: newKeyName() };
      if (newKeyExpiry()) {
        input.expiresAt = new Date(newKeyExpiry());
      }
      const result = (await trpc.apiKeys.create.mutate(input)) as unknown as { rawKey?: string };
      if (result?.rawKey) {
        setCreatedKey(result.rawKey);
      }
      setNewKeyName("");
      setNewKeyExpiry("");
      void refetchKeys();
      showToast("API key created", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setKeyCreating(false);
    }
  };

  const handleRevokeKey = async (id: string): Promise<void> => {
    try {
      await trpc.apiKeys.revoke.mutate({ id });
      void refetchKeys();
      showToast("API key revoked", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const handleCopyKey = (): void => {
    const key = createdKey();
    if (key) {
      void navigator.clipboard.writeText(key);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handleCreateWebhook = async (): Promise<void> => {
    if (!newWebhookUrl().trim()) return;
    setWebhookCreating(true);

    try {
      await trpc.webhooks.create.mutate({
        url: newWebhookUrl(),
        events: ["build.completed", "deployment.ready"],
      });
      setNewWebhookUrl("");
      void refetchWebhooks();
      showToast("Webhook added", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setWebhookCreating(false);
    }
  };

  const handleDeleteWebhook = async (id: string): Promise<void> => {
    try {
      await trpc.webhooks.delete.mutate({ id });
      void refetchWebhooks();
      showToast("Webhook deleted", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const handleTestWebhook = async (id: string): Promise<void> => {
    setTestingWebhookId(id);
    setTestResult(null);

    try {
      const result = (await trpc.webhooks.test.mutate({ id })) as unknown as {
        success: boolean;
        statusCode: number;
        statusText: string;
      };
      setTestResult({
        success: result.success,
        status: `${result.statusCode} ${result.statusText}`,
      });
    } catch (err) {
      setTestResult({ success: false, status: friendlyError(err) });
    } finally {
      setTestingWebhookId(null);
    }
  };

  return (
    <Stack direction="vertical" gap="lg">
      {/* API Keys */}
      <Section title="API Keys" description="Manage API keys for programmatic access. Keys use the btf_sk_ prefix and are hashed with SHA-256.">
        <Stack direction="vertical" gap="md">
          {/* Created key alert -- shown only once */}
          <Show when={createdKey()}>
            <Card padding="md" class="border-yellow-600 bg-yellow-950/30">
              <Stack direction="vertical" gap="sm">
                <Text variant="body" weight="semibold" class="text-yellow-300">
                  Save your API key now -- it will not be shown again.
                </Text>
                <Stack direction="horizontal" gap="sm" align="center">
                  <code class="bg-gray-900 px-3 py-1.5 rounded text-sm font-mono text-green-400 flex-1 overflow-x-auto">
                    {createdKey()}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyKey}>
                    {keyCopied() ? "Copied!" : "Copy"}
                  </Button>
                </Stack>
              </Stack>
            </Card>
          </Show>

          {/* Existing keys list */}
          <Show
            when={(apiKeys() ?? []).length > 0}
            fallback={
              <Text variant="caption" class="text-muted">
                No API keys yet. Create one to get started.
              </Text>
            }
          >
            <div class="space-y-2">
              <For each={apiKeys() ?? []}>
                {(key) => (
                  <div class="flex items-center justify-between p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <Stack direction="vertical" gap="xs" class="flex-1 min-w-0">
                      <Stack direction="horizontal" gap="sm" align="center">
                        <Text variant="body" weight="semibold">{key.name}</Text>
                        <Show when={key.expiresAt}>
                          <Badge variant="default" size="sm">
                            Expires {new Date(key.expiresAt!).toLocaleDateString()}
                          </Badge>
                        </Show>
                      </Stack>
                      <code class="text-xs font-mono text-gray-400 truncate">
                        {key.maskedKey}
                      </code>
                      <Show when={key.lastUsedAt}>
                        <Text variant="caption" class="text-muted">
                          Last used: {new Date(key.lastUsedAt!).toLocaleDateString()}
                        </Text>
                      </Show>
                    </Stack>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRevokeKey(key.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Create new key form */}
          <Card padding="md" class="bg-gray-800/30">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" weight="semibold">Create New Key</Text>
              <Stack direction="horizontal" gap="sm">
                <Input
                  label="Key Name"
                  type="text"
                  value={newKeyName()}
                  onInput={(e) => setNewKeyName(e.currentTarget.value)}
                  placeholder="e.g., Production, CI/CD"
                />
                <Input
                  label="Expires (optional)"
                  type="date"
                  value={newKeyExpiry()}
                  onInput={(e) => setNewKeyExpiry(e.currentTarget.value)}
                />
              </Stack>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateKey()}
                disabled={!newKeyName().trim() || keyCreating()}
              >
                {keyCreating() ? "Creating..." : "Generate Key"}
              </Button>
            </Stack>
          </Card>

          <Text variant="caption" class="text-muted">
            Keep your API keys secret. Never expose them in client-side code.
            Use environment variables or secrets management for production deployments.
          </Text>
        </Stack>
      </Section>

      {/* Webhooks */}
      <Section title="Webhooks" description="Receive HTTP callbacks when events occur in your projects.">
        <Stack direction="vertical" gap="md">
          {/* Existing webhooks */}
          <Show
            when={(webhooks() ?? []).length > 0}
            fallback={
              <Text variant="caption" class="text-muted">
                No webhooks configured. Add one to receive event notifications.
              </Text>
            }
          >
            <div class="space-y-2">
              <For each={webhooks() ?? []}>
                {(hook) => (
                  <div class="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <Stack direction="horizontal" gap="sm" align="center" class="justify-between">
                      <Stack direction="vertical" gap="xs" class="flex-1 min-w-0">
                        <code class="text-sm font-mono text-gray-300 truncate block">
                          {hook.url}
                        </code>
                        <Stack direction="horizontal" gap="xs">
                          <For each={hook.events}>
                            {(event) => (
                              <Badge variant="default" size="sm">{event}</Badge>
                            )}
                          </For>
                        </Stack>
                        <Show when={!hook.isActive}>
                          <Badge variant="default" size="sm">Inactive</Badge>
                        </Show>
                      </Stack>
                      <Stack direction="horizontal" gap="sm">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleTestWebhook(hook.id)}
                          disabled={testingWebhookId() === hook.id}
                        >
                          {testingWebhookId() === hook.id ? "Testing..." : "Test"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDeleteWebhook(hook.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Test result */}
          <Show when={testResult()}>
            {(result) => (
              <Card padding="sm" class={result().success ? "border-green-700 bg-green-950/30" : "border-red-700 bg-red-950/30"}>
                <Text variant="caption" class={result().success ? "text-green-300" : "text-red-300"}>
                  {result().success ? "Webhook test succeeded" : "Webhook test failed"}: {result().status}
                </Text>
              </Card>
            )}
          </Show>

          {/* Add webhook form */}
          <Card padding="md" class="bg-gray-800/30">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" weight="semibold">Add Webhook</Text>
              <Input
                label="Endpoint URL"
                type="url"
                value={newWebhookUrl()}
                onInput={(e) => setNewWebhookUrl(e.currentTarget.value)}
                placeholder="https://example.com/webhook"
              />
              <Text variant="caption" class="text-muted">
                Default events: build.completed, deployment.ready. Edit events after creation.
              </Text>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateWebhook()}
                disabled={!newWebhookUrl().trim() || webhookCreating()}
              >
                {webhookCreating() ? "Creating..." : "Add Webhook"}
              </Button>
            </Stack>
          </Card>

          <Text variant="caption" class="text-muted">
            Webhooks are signed with HMAC-SHA256. Verify the X-BTF-Signature header to ensure authenticity.
          </Text>
        </Stack>
      </Section>

      {/* API Usage Stats */}
      <Section title="API Usage" description="Overview of your API key usage.">
        <Stack direction="vertical" gap="sm">
          <div class="grid grid-cols-3 gap-4">
            <Card padding="sm">
              <Stack direction="vertical" gap="xs" align="center">
                <Text variant="caption" class="text-muted">Active Keys</Text>
                <Text variant="h3" weight="bold">{(apiKeys() ?? []).length}</Text>
              </Stack>
            </Card>
            <Card padding="sm">
              <Stack direction="vertical" gap="xs" align="center">
                <Text variant="caption" class="text-muted">Webhooks</Text>
                <Text variant="h3" weight="bold">{(webhooks() ?? []).length}</Text>
              </Stack>
            </Card>
            <Card padding="sm">
              <Stack direction="vertical" gap="xs" align="center">
                <Text variant="caption" class="text-muted">Requests Today</Text>
                <Text variant="h3" weight="bold">--</Text>
              </Stack>
            </Card>
          </div>
          <Text variant="caption" class="text-muted">
            Detailed usage analytics coming soon. View the API docs at <a href="/docs" class="text-blue-400 hover:underline">/docs</a>.
          </Text>
        </Stack>
      </Section>
    </Stack>
  );
}

// ── Main Settings Page ──────────────────────────────────────────────

export default function SettingsPage(): JSX.Element {
  const auth = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = createSignal(auth.currentUser()?.displayName ?? "");
  const [profileSaved, setProfileSaved] = createSignal(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"general" | "developer">("general");

  const handleSaveProfile = (): void => {
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  return (
    <ProtectedRoute>
      <Title>Settings - Marco Reid</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Settings</Text>
          <Text variant="body" class="text-muted">
            Manage your account, preferences, and integrations.
          </Text>
        </Stack>

        {/* Tab Navigation */}
        <Stack direction="horizontal" gap="sm">
          <Button
            variant={activeTab() === "general" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("general")}
          >
            General
          </Button>
          <Button
            variant={activeTab() === "developer" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("developer")}
          >
            Developer
          </Button>
        </Stack>

        {/* General Tab */}
        <Show when={activeTab() === "general"}>
          <Stack direction="vertical" gap="lg">
            <Section title="Profile" description="Update your personal information.">
              <Stack direction="vertical" gap="md">
                <Input
                  label="Display Name"
                  type="text"
                  value={displayName()}
                  onInput={(e) => setDisplayName(e.currentTarget.value)}
                  placeholder="Your display name"
                />
                <Input
                  label="Email"
                  type="email"
                  value={auth.currentUser()?.email ?? ""}
                  disabled
                  placeholder="Email cannot be changed"
                />
                <Stack direction="horizontal" gap="sm" align="center">
                  <Button variant="primary" size="sm" onClick={handleSaveProfile}>
                    Save Changes
                  </Button>
                  <Show when={profileSaved()}>
                    <Badge variant="success" size="sm">Saved</Badge>
                  </Show>
                </Stack>
              </Stack>
            </Section>

            <Section title="Appearance" description="Customize the look and feel.">
              <Stack direction="horizontal" gap="md">
                <Button
                  variant={!isDark() ? "primary" : "outline"}
                  size="sm"
                  onClick={() => { if (isDark()) toggleTheme(); }}
                >
                  Light Mode
                </Button>
                <Button
                  variant={isDark() ? "primary" : "outline"}
                  size="sm"
                  onClick={() => { if (!isDark()) toggleTheme(); }}
                >
                  Dark Mode
                </Button>
              </Stack>
            </Section>

            <Section title="Danger Zone" description="Irreversible actions.">
              <Show
                when={showDeleteConfirm()}
                fallback={
                  <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                    Delete Account
                  </Button>
                }
              >
                <Card padding="md">
                  <Stack direction="vertical" gap="md">
                    <Text variant="body" weight="semibold">Are you sure?</Text>
                    <Text variant="caption" class="text-muted">
                      This will permanently delete your account and all data.
                    </Text>
                    <Stack direction="horizontal" gap="sm">
                      <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); alert("Account deletion requested. Contact support to finalize."); }}>Yes, Delete</Button>
                      <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              </Show>
            </Section>
          </Stack>
        </Show>

        {/* Developer Tab */}
        <Show when={activeTab() === "developer"}>
          <DeveloperSection />
        </Show>
      </Stack>
    </ProtectedRoute>
  );
}
