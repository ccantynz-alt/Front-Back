import { Title } from "@solidjs/meta";
import { createSignal, For, Show, Switch, Match } from "solid-js";
import type { JSX } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

type SettingsTab = "profile" | "account" | "api-keys" | "ai-providers" | "notifications" | "appearance";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string;
  status: "active" | "expired";
}

// ── Mock Data ────────────────────────────────────────────────────────

const MOCK_API_KEYS: ApiKey[] = [
  { id: "1", name: "Production Server", prefix: "ct_sk_prod_...a3f8", createdAt: "Mar 12, 2026", lastUsed: "2 hours ago", status: "active" },
  { id: "2", name: "CI/CD Pipeline", prefix: "ct_sk_ci_...7b2e", createdAt: "Feb 28, 2026", lastUsed: "14 min ago", status: "active" },
  { id: "3", name: "Staging Environment", prefix: "ct_sk_stg_...9d1c", createdAt: "Jan 15, 2026", lastUsed: "3 days ago", status: "active" },
  { id: "4", name: "Legacy Integration", prefix: "ct_sk_leg_...4e0a", createdAt: "Dec 01, 2025", lastUsed: "Never", status: "expired" },
];

const ACCENT_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Cyan", value: "#06b6d4" },
];

// ── Tab Button ───────────────────────────────────────────────────────

function TabButton(props: { label: string; icon: string; isActive: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
        props.isActive
          ? "border border-white/[0.1] bg-white/[0.06] text-white shadow-lg shadow-black/20"
          : "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
      }`}
    >
      <span class="text-base">{props.icon}</span>
      {props.label}
    </button>
  );
}

// ── Section Wrapper ──────────────────────────────────────────────────

function SettingsSection(props: { title: string; description: string; children: JSX.Element }): JSX.Element {
  return (
    <div
      class="rounded-2xl border border-white/[0.06] p-6"
      style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
    >
      <div class="mb-5">
        <h3 class="text-base font-semibold text-white">{props.title}</h3>
        <p class="mt-0.5 text-xs text-gray-500">{props.description}</p>
      </div>
      {props.children}
    </div>
  );
}

// ── Input Field ──────────────────────────────────────────────────────

function SettingsInput(props: {
  label: string;
  value: string;
  onInput: (val: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-widest text-gray-500">{props.label}</label>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        class={`w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 ${
          props.disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      />
      <Show when={props.hint}>
        <span class="text-[11px] text-gray-600">{props.hint}</span>
      </Show>
    </div>
  );
}

// ── Profile Tab ──────────────────────────────────────────────────────

function ProfileTab(): JSX.Element {
  const [name, setName] = createSignal("Craig Robertson");
  const [email] = createSignal("craig@crontech.dev");
  const [bio, setBio] = createSignal("Building the future of AI-native development platforms. Founder at Crontech.");
  const [saved, setSaved] = createSignal(false);

  const handleSave = (): void => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="Profile Information" description="Your public identity on the platform.">
        <div class="flex flex-col gap-5">
          {/* Avatar */}
          <div class="flex items-center gap-5">
            <div class="relative group">
              <div
                class="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold text-white"
                style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
              >
                CR
              </div>
              <button
                type="button"
                onClick={() => {
                  const fileInput = document.createElement("input");
                  fileInput.type = "file";
                  fileInput.accept = "image/png,image/jpeg,image/webp";
                  fileInput.onchange = () => {
                    if (fileInput.files?.[0]) {
                      console.log("[Settings] Avatar selected:", fileInput.files[0].name);
                    }
                  };
                  fileInput.click();
                }}
                class="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              >
                Change
              </button>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-gray-200">Profile Photo</span>
              <span class="text-xs text-gray-500">PNG, JPG, or WebP. Max 2MB.</span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SettingsInput label="Display Name" value={name()} onInput={setName} placeholder="Your name" />
            <SettingsInput label="Email Address" value={email()} onInput={() => {}} disabled hint="Contact support to change your email" />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium uppercase tracking-widest text-gray-500">Bio</label>
            <textarea
              value={bio()}
              onInput={(e) => setBio(e.currentTarget.value)}
              rows={3}
              class="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              placeholder="Tell us about yourself..."
            />
            <span class="text-right text-[11px] text-gray-600">{bio().length}/280</span>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              class="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/40 hover:brightness-110"
            >
              Save Changes
            </button>
            <Show when={saved()}>
              <span class="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span>&#10003;</span> Saved successfully
              </span>
            </Show>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── Account Tab ──────────────────────────────────────────────────────

function AccountTab(): JSX.Element {
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = createSignal(false);
  const [sessionsRevoked, setSessionsRevoked] = createSignal(false);
  const [accountDeleted, setAccountDeleted] = createSignal(false);

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="Security" description="Manage your authentication methods and security settings.">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-4">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ background: "#10b98118", color: "#10b981" }}>&#128272;</span>
              <div>
                <span class="text-sm font-medium text-gray-200">Passkey Authentication</span>
                <p class="text-xs text-gray-500">FIDO2 / WebAuthn biometric login</p>
              </div>
            </div>
            <span class="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Enabled</span>
          </div>

          <div class="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-4">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ background: "#3b82f618", color: "#3b82f6" }}>&#128231;</span>
              <div>
                <span class="text-sm font-medium text-gray-200">Two-Factor Authentication</span>
                <p class="text-xs text-gray-500">TOTP via authenticator app</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTwoFactorEnabled(true);
              }}
              class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:text-white"
            >
              {twoFactorEnabled() ? "Enabled" : "Enable"}
            </button>
          </div>

          <div class="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-4">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ background: "#f59e0b18", color: "#f59e0b" }}>&#128187;</span>
              <div>
                <span class="text-sm font-medium text-gray-200">Active Sessions</span>
                <p class="text-xs text-gray-500">3 devices currently signed in</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSessionsRevoked(true);
                setTimeout(() => setSessionsRevoked(false), 3000);
              }}
              class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all duration-200 hover:border-red-500/30 hover:text-red-400"
            >
              {sessionsRevoked() ? "Revoked!" : "Revoke All"}
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Danger Zone" description="Irreversible actions. Proceed with extreme caution.">
        <Show
          when={!showDeleteConfirm()}
          fallback={
            <div class="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
              <p class="mb-3 text-sm font-medium text-red-400">This will permanently delete your account, all projects, and all data. This action cannot be undone.</p>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountDeleted(true);
                    setShowDeleteConfirm(false);
                  }}
                  class="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-red-500"
                >
                  {accountDeleted() ? "Deletion Requested" : "Yes, Delete My Account"}
                </button>
              </div>
            </div>
          }
        >
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            class="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-sm font-medium text-red-400 transition-all duration-200 hover:border-red-500/40 hover:bg-red-500/10"
          >
            Delete Account
          </button>
        </Show>
      </SettingsSection>
    </div>
  );
}

// ── API Keys Tab ─────────────────────────────────────────────────────

function ApiKeysTab(): JSX.Element {
  const [keys, setKeys] = createSignal(MOCK_API_KEYS);
  const [newKeyName, setNewKeyName] = createSignal("");
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  const handleCopy = (id: string, prefix: string): void => {
    void navigator.clipboard.writeText(prefix);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = (id: string): void => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="API Keys" description="Manage programmatic access to your account. Keys use SHA-256 hashing.">
        <div class="flex flex-col gap-4">
          {/* Key List */}
          <For each={keys()}>
            {(key) => (
              <div class="flex items-center gap-4 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5 transition-all duration-200 hover:border-white/[0.08]">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm"
                  style={{
                    background: key.status === "active" ? "#10b98118" : "#6b728018",
                    color: key.status === "active" ? "#10b981" : "#6b7280",
                  }}
                >
                  &#128273;
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-200">{key.name}</span>
                    <Show when={key.status === "expired"}>
                      <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-red-400">Expired</span>
                    </Show>
                  </div>
                  <code class="text-xs font-mono text-gray-500">{key.prefix}</code>
                </div>
                <div class="hidden flex-col items-end gap-0.5 sm:flex">
                  <span class="text-[11px] text-gray-500">Created {key.createdAt}</span>
                  <span class="text-[11px] text-gray-600">Last used {key.lastUsed}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(key.id, key.prefix)}
                    class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:border-white/[0.12] hover:text-white"
                  >
                    {copiedId() === key.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevoke(key.id)}
                    class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            )}
          </For>

          {/* Generate New Key */}
          <div class="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-5">
            <h4 class="mb-3 text-sm font-semibold text-gray-300">Generate New Key</h4>
            <div class="flex items-end gap-3">
              <div class="flex-1">
                <SettingsInput label="Key Name" value={newKeyName()} onInput={setNewKeyName} placeholder="e.g., Production, CI/CD" />
              </div>
              <button
                type="button"
                disabled={!newKeyName().trim()}
                onClick={() => {
                  const name = newKeyName().trim();
                  if (!name) return;
                  const id = Date.now().toString();
                  const prefix = `ct_sk_${name.toLowerCase().replace(/\s+/g, "_").slice(0, 4)}_...${Math.random().toString(36).slice(2, 6)}`;
                  setKeys((prev) => [
                    ...prev,
                    { id, name, prefix, createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), lastUsed: "Never", status: "active" as const },
                  ]);
                  setNewKeyName("");
                }}
                class="shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/40 hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              >
                Generate Key
              </button>
            </div>
            <p class="mt-3 text-[11px] text-gray-600">
              Keys are hashed with SHA-256. The raw key is shown only once after generation.
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────────────

function NotificationsTab(): JSX.Element {
  const [emailNotifs, setEmailNotifs] = createSignal(true);
  const [buildNotifs, setBuildNotifs] = createSignal(true);
  const [securityNotifs, setSecurityNotifs] = createSignal(true);
  const [marketingNotifs, setMarketingNotifs] = createSignal(false);
  const [weeklyDigest, setWeeklyDigest] = createSignal(true);

  function ToggleRow(props: { label: string; description: string; enabled: boolean; onToggle: () => void }): JSX.Element {
    return (
      <div class="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-4">
        <div>
          <span class="text-sm font-medium text-gray-200">{props.label}</span>
          <p class="text-xs text-gray-500">{props.description}</p>
        </div>
        <button
          type="button"
          onClick={props.onToggle}
          class={`relative h-6 w-11 rounded-full transition-all duration-300 ${
            props.enabled ? "bg-blue-600" : "bg-gray-700"
          }`}
        >
          <div
            class={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 ${
              props.enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <SettingsSection title="Notification Preferences" description="Control how and when you receive notifications.">
      <div class="flex flex-col gap-3">
        <ToggleRow label="Email Notifications" description="Receive important updates via email" enabled={emailNotifs()} onToggle={() => setEmailNotifs(!emailNotifs())} />
        <ToggleRow label="Build & Deploy Alerts" description="Get notified when builds complete or fail" enabled={buildNotifs()} onToggle={() => setBuildNotifs(!buildNotifs())} />
        <ToggleRow label="Security Alerts" description="Login attempts, API key usage, and security events" enabled={securityNotifs()} onToggle={() => setSecurityNotifs(!securityNotifs())} />
        <ToggleRow label="Product Updates" description="New features, improvements, and platform news" enabled={marketingNotifs()} onToggle={() => setMarketingNotifs(!marketingNotifs())} />
        <ToggleRow label="Weekly Digest" description="Summary of your project activity every Monday" enabled={weeklyDigest()} onToggle={() => setWeeklyDigest(!weeklyDigest())} />
      </div>
    </SettingsSection>
  );
}

// ── Appearance Tab ───────────────────────────────────────────────────

function AppearanceTab(): JSX.Element {
  const [theme, setTheme] = createSignal<"dark" | "light" | "system">("dark");
  const [selectedAccent, setSelectedAccent] = createSignal("#3b82f6");

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="Theme" description="Choose your preferred visual appearance.">
        <div class="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            class={`flex flex-col items-center gap-3 rounded-xl border p-5 transition-all duration-200 ${
              theme() === "dark"
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
            }`}
          >
            <div class="flex h-12 w-16 items-center justify-center rounded-lg bg-[#0a0a0a] border border-white/[0.1]">
              <div class="h-2 w-8 rounded-full bg-gray-700" />
            </div>
            <span class={`text-xs font-medium ${theme() === "dark" ? "text-blue-400" : "text-gray-400"}`}>Dark</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            class={`flex flex-col items-center gap-3 rounded-xl border p-5 transition-all duration-200 ${
              theme() === "light"
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
            }`}
          >
            <div class="flex h-12 w-16 items-center justify-center rounded-lg bg-white border border-gray-200">
              <div class="h-2 w-8 rounded-full bg-gray-300" />
            </div>
            <span class={`text-xs font-medium ${theme() === "light" ? "text-blue-400" : "text-gray-400"}`}>Light</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme("system")}
            class={`flex flex-col items-center gap-3 rounded-xl border p-5 transition-all duration-200 ${
              theme() === "system"
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
            }`}
          >
            <div class="flex h-12 w-16 items-center justify-center rounded-lg border border-white/[0.1]" style={{ background: "linear-gradient(135deg, #0a0a0a 50%, #f5f5f5 50%)" }}>
              <div class="h-2 w-8 rounded-full" style={{ background: "linear-gradient(90deg, #4b5563, #d1d5db)" }} />
            </div>
            <span class={`text-xs font-medium ${theme() === "system" ? "text-blue-400" : "text-gray-400"}`}>System</span>
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Accent Color" description="Personalize the platform with your preferred accent.">
        <div class="flex flex-wrap gap-3">
          <For each={ACCENT_COLORS}>
            {(color) => (
              <button
                type="button"
                onClick={() => setSelectedAccent(color.value)}
                class={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200 ${
                  selectedAccent() === color.value
                    ? "border-white/[0.15] bg-white/[0.04]"
                    : "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.1]"
                }`}
              >
                <div
                  class="h-8 w-8 rounded-full transition-shadow duration-200"
                  style={{
                    background: color.value,
                    "box-shadow": selectedAccent() === color.value ? `0 0 16px ${color.value}60` : "none",
                  }}
                />
                <span class="text-[11px] text-gray-400">{color.name}</span>
              </button>
            )}
          </For>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── AI Providers Tab ────────────────────────────────────────────────

function AIProvidersTab(): JSX.Element {
  const [anthropicKey, setAnthropicKey] = createSignal("");
  const [savedKey, setSavedKey] = createSignal<{ prefix: string; createdAt: string } | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [deleteConfirm, setDeleteConfirm] = createSignal(false);
  const [message, setMessage] = createSignal<{ type: "success" | "error"; text: string } | null>(null);

  // Check for existing key on mount
  const checkExistingKey = async (): Promise<void> => {
    try {
      const { trpc } = await import("../lib/trpc");
      const result = await trpc.chat.getProviderKey.query({ provider: "anthropic" });
      if (result) {
        setSavedKey({
          prefix: result.prefix,
          createdAt: new Date(result.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
      }
    } catch {
      // Not logged in or network error
    }
  };

  void checkExistingKey();

  const handleSave = async (): Promise<void> => {
    const key = anthropicKey().trim();
    if (!key) return;
    if (!key.startsWith("sk-ant-")) {
      setMessage({ type: "error", text: "Invalid Anthropic API key. Keys should start with sk-ant-" });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const { trpc } = await import("../lib/trpc");
      const result = await trpc.chat.saveProviderKey.mutate({ provider: "anthropic", apiKey: key });
      setSavedKey({ prefix: result.prefix, createdAt: "Just now" });
      setAnthropicKey("");
      setMessage({ type: "success", text: "Anthropic API key saved successfully." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save key" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      const { trpc } = await import("../lib/trpc");
      await trpc.chat.deleteProviderKey.mutate({ provider: "anthropic" });
      setSavedKey(null);
      setDeleteConfirm(false);
      setMessage({ type: "success", text: "API key deleted." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete key" });
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="Anthropic API Key" description="Connect your Anthropic API key to use Claude models directly. Pay only for what you use.">
        <div class="flex flex-col gap-4">
          {/* Status message */}
          <Show when={message()}>
            {(msg) => (
              <div class={`rounded-xl border px-4 py-3 text-xs font-medium ${
                msg().type === "success"
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                  : "border-red-500/20 bg-red-500/5 text-red-400"
              }`}>
                {msg().text}
              </div>
            )}
          </Show>

          {/* Existing key display */}
          <Show when={savedKey()}>
            {(key) => (
              <div class="flex items-center gap-4 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3.5">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: "#f9731618", color: "#f97316" }}>
                  &#9889;
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-200">Anthropic (Claude)</span>
                    <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-400">Active</span>
                  </div>
                  <code class="text-xs font-mono text-gray-500">{key().prefix}</code>
                </div>
                <div class="hidden flex-col items-end gap-0.5 sm:flex">
                  <span class="text-[11px] text-gray-500">Added {key().createdAt}</span>
                </div>
                <Show when={!deleteConfirm()} fallback={
                  <div class="flex items-center gap-1.5">
                    <button type="button" onClick={() => setDeleteConfirm(false)} class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:text-white">Cancel</button>
                    <button type="button" onClick={() => void handleDelete()} class="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-all hover:bg-red-500">Delete</button>
                  </div>
                }>
                  <button type="button" onClick={() => setDeleteConfirm(true)} class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400">
                    Remove
                  </button>
                </Show>
              </div>
            )}
          </Show>

          {/* Add new key */}
          <div class="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-5">
            <h4 class="mb-3 text-sm font-semibold text-gray-300">{savedKey() ? "Replace Key" : "Add API Key"}</h4>
            <div class="flex items-end gap-3">
              <div class="flex-1">
                <SettingsInput
                  label="Anthropic API Key"
                  value={anthropicKey()}
                  onInput={setAnthropicKey}
                  type="password"
                  placeholder="sk-ant-api03-..."
                  hint="Get your key from console.anthropic.com"
                />
              </div>
              <button
                type="button"
                disabled={!anthropicKey().trim() || saving()}
                onClick={() => void handleSave()}
                class="shrink-0 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all duration-200 hover:shadow-orange-500/40 hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              >
                {saving() ? "Saving..." : "Save Key"}
              </button>
            </div>
            <p class="mt-3 text-[11px] text-gray-600">
              Your key is encrypted at rest. Only the prefix is stored in plaintext for identification.
            </p>
          </div>

          {/* Cost comparison */}
          <div class="rounded-xl border border-white/[0.04] bg-white/[0.02] p-5">
            <h4 class="mb-3 text-sm font-semibold text-gray-300">Cost Comparison</h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg border border-red-500/10 bg-red-500/5 p-4">
                <span class="text-xs text-gray-500">Subscriptions</span>
                <div class="mt-1 text-2xl font-bold text-red-400">$1,800<span class="text-sm font-normal text-gray-600">/mo</span></div>
                <span class="text-[10px] text-gray-600">Fixed cost, whether you use it or not</span>
              </div>
              <div class="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-4">
                <span class="text-xs text-gray-500">API Direct</span>
                <div class="mt-1 text-2xl font-bold text-emerald-400">Pay-per-use</div>
                <span class="text-[10px] text-gray-600">$3/1M input tokens with Sonnet</span>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── Main Settings Page ───────────────────────────────────────────────

export default function SettingsPage(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<SettingsTab>("profile");

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "&#128100;" },
    { id: "account", label: "Account", icon: "&#128274;" },
    { id: "api-keys", label: "API Keys", icon: "&#128273;" },
    { id: "ai-providers", label: "AI Providers", icon: "&#9889;" },
    { id: "notifications", label: "Notifications", icon: "&#128276;" },
    { id: "appearance", label: "Appearance", icon: "&#127912;" },
  ];

  return (
    <div class="min-h-screen bg-[#060606]">
      <Title>Settings - Crontech</Title>

      <div class="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div class="mb-8">
          <h1 class="text-3xl font-bold tracking-tight text-white">Settings</h1>
          <p class="mt-1 text-sm text-gray-500">Manage your account, security, and preferences</p>
        </div>

        {/* Tab Navigation */}
        <div class="mb-8 flex flex-wrap gap-1 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-1.5">
          <For each={tabs}>
            {(tab) => (
              <TabButton
                label={tab.label}
                icon={tab.icon}
                isActive={activeTab() === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            )}
          </For>
        </div>

        {/* Tab Content */}
        <Switch>
          <Match when={activeTab() === "profile"}>
            <ProfileTab />
          </Match>
          <Match when={activeTab() === "account"}>
            <AccountTab />
          </Match>
          <Match when={activeTab() === "api-keys"}>
            <ApiKeysTab />
          </Match>
          <Match when={activeTab() === "ai-providers"}>
            <AIProvidersTab />
          </Match>
          <Match when={activeTab() === "notifications"}>
            <NotificationsTab />
          </Match>
          <Match when={activeTab() === "appearance"}>
            <AppearanceTab />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
