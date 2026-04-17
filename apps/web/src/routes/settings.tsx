import { Title } from "@solidjs/meta";
import { createSignal, createMemo, For, Show, Switch, Match } from "solid-js";
import type { JSX } from "solid-js";
import { trpc } from "../lib/trpc";
import { useQuery, useMutation, invalidateQueries, friendlyError } from "../lib/use-trpc";
import { useAuth } from "../stores";

// ── Types ────────────────────────────────────────────────────────────

type SettingsTab = "profile" | "account" | "api-keys" | "ai-providers" | "notifications" | "appearance";

// ── Tab Button ───────────────────────────────────────────────────────

function TabButton(props: { label: string; icon: string; isActive: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
      style={{
        color: props.isActive ? "var(--color-text)" : "var(--color-text-muted)",
        background: props.isActive ? "var(--color-bg-muted)" : "transparent",
        border: props.isActive ? "1px solid var(--color-border-strong)" : "1px solid transparent",
      }}
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
      class="rounded-2xl p-6"
      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
    >
      <div class="mb-5">
        <h3 class="text-base font-semibold" style={{ color: "var(--color-text)" }}>{props.title}</h3>
        <p class="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{props.description}</p>
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
      <label class="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>{props.label}</label>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        class={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 ${
          props.disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        style={{
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-subtle)",
          color: "var(--color-text)",
        }}
      />
      <Show when={props.hint}>
        <span class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>{props.hint}</span>
      </Show>
    </div>
  );
}

// ── Profile Tab ──────────────────────────────────────────────────────
//
// Wired to the real trpc.users.update mutation. Only the fields actually
// persisted by the schema (displayName) are editable here. The user's
// email comes from the auth record and is intentionally read-only — there
// is no self-service email-change flow yet, so pretending otherwise would
// just strand the user when the save silently drops.
//
// Bio, avatar upload, and timezone all used to live here as pure theater.
// They're gone until the schema + upload pipeline exist.

function ProfileTab(): JSX.Element {
  const auth = useAuth();
  const initialName = auth.currentUser()?.displayName ?? "";
  const [name, setName] = createSignal(initialName);
  const [message, setMessage] = createSignal<{ type: "success" | "error"; text: string } | null>(null);

  const save = useMutation(
    (input: { id: string; displayName: string }) => trpc.users.update.mutate(input),
    { invalidates: ["current-user"] },
  );

  const initials = createMemo((): string => {
    const n = name().trim() || initialName;
    if (!n) return "?";
    const parts = n.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
    return (first + last).toUpperCase() || "?";
  });

  const handleSave = async (): Promise<void> => {
    const user = auth.currentUser();
    if (!user) return;
    const trimmed = name().trim();
    if (!trimmed || trimmed === user.displayName) {
      setMessage({ type: "error", text: "Change your display name to save." });
      return;
    }
    setMessage(null);
    try {
      await save.mutate({ id: user.id, displayName: trimmed });
      setMessage({ type: "success", text: "Display name saved." });
    } catch (err) {
      setMessage({ type: "error", text: friendlyError(err) });
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection title="Profile Information" description="Your public identity on the platform.">
        <div class="flex flex-col gap-5">
          <Show when={message()}>
            {(msg) => (
              <div
                class={`rounded-xl border px-4 py-3 text-xs font-medium ${
                  msg().type === "success"
                    ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]"
                    : "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
                }`}
              >
                {msg().text}
              </div>
            )}
          </Show>

          {/* Avatar — initials only until upload pipeline ships */}
          <div class="flex items-center gap-5">
            <div
              class="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold"
              style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
            >
              {initials()}
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-[var(--color-text)]">Avatar</span>
              <span class="text-xs text-[var(--color-text-muted)]">
                Auto-generated from your initials. Custom uploads arrive with
                the file-storage pipeline.
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SettingsInput
              label="Display Name"
              value={name()}
              onInput={setName}
              placeholder="Your name"
            />
            <SettingsInput
              label="Email Address"
              value={auth.currentUser()?.email ?? ""}
              onInput={() => {}}
              disabled
              hint="Email changes require support — no self-service flow yet"
            />
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              disabled={save.loading() || !name().trim() || name().trim() === initialName}
              onClick={() => void handleSave()}
              class="rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
            >
              {save.loading() ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── Account Tab ──────────────────────────────────────────────────────
//
// Honest view of the authentication methods the backend actually supports.
// We do NOT render:
//   - A 2FA toggle — there is no TOTP enrollment endpoint yet.
//   - An "Active sessions / revoke all" row — there is no multi-session
//     listing endpoint; the button just lied.
//   - A Delete Account button — there is no cascade-delete of a user's
//     projects, files, keys, subscriptions, audit rows. Pretending this
//     works would strand users who clicked it, believing their data was
//     gone when it wasn't.
//
// When those endpoints ship, this tab grows back. Until then, it tells
// the truth about what's available right now.

function AccountTab(): JSX.Element {
  const auth = useAuth();

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection
        title="Sign-in Methods"
        description="The ways you can authenticate into Crontech today."
      >
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-4">
            <div class="flex items-center gap-3">
              <span
                class="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                style={{ background: "color-mix(in oklab, var(--color-success) 10%, transparent)", color: "var(--color-success)" }}
              >
                &#128272;
              </span>
              <div>
                <span class="text-sm font-medium text-[var(--color-text)]">Passkey (WebAuthn)</span>
                <p class="text-xs text-[var(--color-text-muted)]">
                  Biometric sign-in bound to this origin. Phishing-immune.
                </p>
              </div>
            </div>
            <span class="rounded-full bg-[var(--color-success-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-success)]">
              Supported
            </span>
          </div>

          <div class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-4">
            <div class="flex items-center gap-3">
              <span
                class="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                style={{ background: "color-mix(in oklab, var(--color-primary) 10%, transparent)", color: "var(--color-primary)" }}
              >
                G
              </span>
              <div>
                <span class="text-sm font-medium text-[var(--color-text)]">Google OAuth</span>
                <p class="text-xs text-[var(--color-text-muted)]">
                  One-click sign-in via a Google account.
                </p>
              </div>
            </div>
            <span class="rounded-full bg-[var(--color-success-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-success)]">
              Supported
            </span>
          </div>

          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
            TOTP 2FA, multi-device session listing, and "revoke all sessions"
            arrive with the auth hardening block. Those controls aren't
            rendered here yet because the backend for them isn't live — we'd
            rather leave them off than fake them.
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Account"
        description="Metadata the server actually knows about you."
      >
        <div class="flex flex-col gap-2 text-xs text-[var(--color-text-muted)]">
          <Show when={auth.currentUser()}>
            {(user) => (
              <>
                <div class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3">
                  <span>User ID</span>
                  <code class="font-mono text-[11px] text-[var(--color-text-muted)]">{user().id}</code>
                </div>
                <div class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3">
                  <span>Role</span>
                  <span class="font-medium text-[var(--color-text-secondary)]">{user().role}</span>
                </div>
                <div class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3">
                  <span>Member since</span>
                  <span class="font-medium text-[var(--color-text-secondary)]">
                    {new Date(user().createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </>
            )}
          </Show>
          <p class="mt-3 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
            Account deletion isn't self-service yet — cascading delete across
            projects, files, keys, subscriptions, and audit rows is still on
            the build list. To close an account today, email{" "}
            <code class="font-mono text-[var(--color-text-muted)]">support@crontech.ai</code>.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── API Keys Tab ─────────────────────────────────────────────────────
//
// Real keys. The raw secret is returned exactly once by the server on
// create() and never stored or retransmitted. Revoke() deletes server-side
// by hash match — the key stops working immediately, not just visually.

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ApiKeysTab(): JSX.Element {
  const keys = useQuery(
    () => trpc.apiKeys.list.query().catch(() => [] as Awaited<ReturnType<typeof trpc.apiKeys.list.query>>),
    { key: "api-keys" },
  );

  const createKey = useMutation(
    (input: { name: string }) => trpc.apiKeys.create.mutate(input),
    { invalidates: ["api-keys"] },
  );

  const revokeKey = useMutation(
    (input: { id: string }) => trpc.apiKeys.revoke.mutate(input),
    { invalidates: ["api-keys"] },
  );

  const [newKeyName, setNewKeyName] = createSignal("");
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const [revealedKey, setRevealedKey] = createSignal<{ id: string; name: string; rawKey: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const handleCopy = (id: string, value: string): void => {
    void navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerate = async (): Promise<void> => {
    const name = newKeyName().trim();
    if (!name) return;
    setError(null);
    try {
      const result = await createKey.mutate({ name });
      setRevealedKey({ id: result.id, name: result.name, rawKey: result.rawKey });
      setNewKeyName("");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const handleRevoke = async (id: string): Promise<void> => {
    setError(null);
    try {
      await revokeKey.mutate({ id });
      setConfirmRevoke(null);
      // Drop the reveal banner if the user just revoked the key they were viewing.
      if (revealedKey()?.id === id) setRevealedKey(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <SettingsSection
        title="API Keys"
        description="Programmatic access tokens. SHA-256 hashed server-side — the raw secret is shown exactly once at creation time."
      >
        <div class="flex flex-col gap-4">
          <Show when={error()}>
            {(msg) => (
              <div class="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-xs font-medium text-[var(--color-danger)]">
                {msg()}
              </div>
            )}
          </Show>

          {/* Just-created key — shown exactly once */}
          <Show when={revealedKey()}>
            {(reveal) => (
              <div class="rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-5">
                <div class="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-[var(--color-warning)]">
                      Save this key now — it will not be shown again.
                    </p>
                    <p class="mt-1 text-xs text-[var(--color-warning)]">
                      Name: <span class="font-mono">{reveal().name}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevealedKey(null)}
                    class="text-[11px] text-[var(--color-warning)]/60 hover:text-[var(--color-warning)]"
                  >
                    Dismiss
                  </button>
                </div>
                <div class="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5" style={{ background: "var(--color-bg-muted)" }}>
                  <code class="flex-1 break-all font-mono text-xs" style={{ color: "var(--color-warning)" }}>
                    {reveal().rawKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(reveal().id, reveal().rawKey)}
                    class="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:brightness-110"
                    style={{
                      border: "1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)",
                      background: "color-mix(in oklab, var(--color-warning) 10%, transparent)",
                      color: "var(--color-warning)",
                    }}
                  >
                    {copiedId() === reveal().id ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </Show>

          {/* Key list */}
          <Show
            when={!keys.loading() && (keys.data() ?? []).length > 0}
            fallback={
              <div class="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                <Show when={keys.loading()} fallback="No API keys yet. Generate one below.">
                  Loading keys…
                </Show>
              </div>
            }
          >
            <For each={keys.data() ?? []}>
              {(key) => {
                const expired = createMemo((): boolean => {
                  const raw: unknown = key.expiresAt;
                  if (!raw) return false;
                  const t = raw instanceof Date ? raw.getTime() : new Date(raw as string | number).getTime();
                  return !Number.isNaN(t) && t < Date.now();
                });
                const isConfirming = createMemo((): boolean => confirmRevoke() === key.id);
                return (
                  <div class="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3.5 transition-all duration-200 hover:border-[var(--color-border-hover)]">
                    <div
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm"
                      style={{
                        background: expired() ? "color-mix(in oklab, var(--color-text-muted) 10%, transparent)" : "color-mix(in oklab, var(--color-success) 10%, transparent)",
                        color: expired() ? "var(--color-text-muted)" : "var(--color-success)",
                      }}
                    >
                      &#128273;
                    </div>
                    <div class="flex min-w-0 flex-1 flex-col">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-[var(--color-text)]">{key.name}</span>
                        <Show when={expired()}>
                          <span
                            class="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
                            style={{
                              background: "color-mix(in oklab, var(--color-danger) 15%, transparent)",
                              color: "var(--color-danger)",
                            }}
                          >
                            Expired
                          </span>
                        </Show>
                      </div>
                      <code class="text-xs font-mono text-[var(--color-text-muted)]">{key.maskedKey}</code>
                    </div>
                    <div class="hidden flex-col items-end gap-0.5 sm:flex">
                      <span class="text-[11px] text-[var(--color-text-muted)]">Created {formatDate(key.createdAt)}</span>
                      <span class="text-[11px] text-[var(--color-text-faint)]">Last used {formatDate(key.lastUsedAt)}</span>
                    </div>
                    <Show
                      when={!isConfirming()}
                      fallback={
                        <div class="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmRevoke(null)}
                            class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-all hover:text-[var(--color-text)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={revokeKey.loading()}
                            onClick={() => void handleRevoke(key.id)}
                            class="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                            style={{ background: "var(--color-danger)", color: "var(--color-text)" }}
                          >
                            {revokeKey.loading() ? "Revoking…" : "Confirm revoke"}
                          </button>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(key.id)}
                        class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-all hover:border-[color-mix(in_oklab,var(--color-danger)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] hover:text-[var(--color-danger)]"
                      >
                        Revoke
                      </button>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>

          {/* Generate New Key */}
          <div class="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-5">
            <h4 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">Generate New Key</h4>
            <div class="flex items-end gap-3">
              <div class="flex-1">
                <SettingsInput
                  label="Key Name"
                  value={newKeyName()}
                  onInput={setNewKeyName}
                  placeholder="e.g., Production, CI/CD"
                />
              </div>
              <button
                type="button"
                disabled={!newKeyName().trim() || createKey.loading()}
                onClick={() => void handleGenerate()}
                class="shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 disabled:opacity-40"
                style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
              >
                {createKey.loading() ? "Generating…" : "Generate Key"}
              </button>
            </div>
            <p class="mt-3 text-[11px] text-[var(--color-text-faint)]">
              Keys use the <code class="font-mono">btf_sk_</code> prefix. Only
              the SHA-256 hash is stored — we cannot recover the raw key if
              you lose it, so copy it out of the banner above on creation.
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────────────
//
// The in-app notification feed is real (trpc.notifications.getAll /
// getUnread / markRead), but there's no preference-storage table for
// channel/category toggles yet — the previous UI stored them in local
// signal only, so refreshing wiped your choices and nothing on the
// server ever respected them. That's theater. We render a preview of
// the categories that will ship instead.

function NotificationsTab(): JSX.Element {
  const items: ReadonlyArray<{ label: string; description: string }> = [
    { label: "Build & Deploy Alerts", description: "Get notified when builds complete or fail." },
    { label: "Security Alerts", description: "Sign-in attempts, API-key usage, and session events." },
    { label: "Collaboration", description: "Mentions, invites, and real-time room activity." },
    { label: "Weekly Digest", description: "Summary of your project activity every Monday." },
    { label: "Product Updates", description: "New features, improvements, and platform news." },
  ];

  return (
    <SettingsSection
      title="Notification Preferences"
      description="Category-level channel preferences arrive with the notifications preference store. In-app alerts already work — the bell icon in the top nav shows your real unread feed."
    >
      <div class="flex flex-col gap-3">
        <div class="rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-xs text-[var(--color-warning)]">
          These toggles aren't wired yet. Rather than save them to a
          server-less signal that evaporates on refresh, we're leaving
          them disabled until the preferences table lands.
        </div>
        <For each={items}>
          {(item) => (
            <div class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-4 opacity-70">
              <div>
                <span class="text-sm font-medium text-[var(--color-text-secondary)]">{item.label}</span>
                <p class="text-xs text-[var(--color-text-muted)]">{item.description}</p>
              </div>
              <span class="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Coming soon
              </span>
            </div>
          )}
        </For>
      </div>
    </SettingsSection>
  );
}

// ── Appearance Tab ───────────────────────────────────────────────────
//
// Dark mode is the only theme the platform actually renders right now —
// the app shell, component library, and marketing pages are all built
// against the dark palette. A theme/accent preference table doesn't
// exist yet, so instead of letting the user pick a light theme that
// would do nothing (or partially render), we describe what's live and
// what's coming.

function AppearanceTab(): JSX.Element {
  return (
    <div class="flex flex-col gap-6">
      <SettingsSection
        title="Theme"
        description="The current visual appearance of the platform."
      >
        <div class="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-4">
          <div class="flex h-12 w-16 items-center justify-center rounded-lg border border-[var(--color-border)]" style={{ background: "var(--color-bg-subtle)" }}>
            <div class="h-2 w-8 rounded-full" style={{ background: "var(--color-text-secondary)" }} />
          </div>
          <div class="flex flex-1 flex-col">
            <span class="text-sm font-medium text-[var(--color-text)]">Dark</span>
            <p class="text-xs text-[var(--color-text-muted)]">
              The only theme Crontech currently renders. Light and System
              modes arrive once the component library is re-themed against
              a light palette — rendering them today would leave half the
              UI unreadable.
            </p>
          </div>
          <span class="rounded-full bg-[var(--color-success-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-success)]">
            Active
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Accent Color"
        description="User-selectable accents arrive with the preferences store."
      >
        <div class="rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-xs text-[var(--color-warning)]">
          There's no preferences table to persist a chosen accent yet,
          and the current UI ships with violet/blue gradients baked in.
          Swatches will return once both pieces are wired.
        </div>
      </SettingsSection>
    </div>
  );
}

// ── GitHub Token Section ────────────────────────────────────────────

function GitHubTokenSection(): JSX.Element {
  const [ghToken, setGhToken] = createSignal("");
  const [savedGh, setSavedGh] = createSignal<{ prefix: string; createdAt: string } | null>(null);
  const [ghSaving, setGhSaving] = createSignal(false);
  const [ghDeleteConfirm, setGhDeleteConfirm] = createSignal(false);
  const [ghMessage, setGhMessage] = createSignal<{ type: "success" | "error"; text: string } | null>(null);

  const checkExistingGh = async (): Promise<void> => {
    try {
      const { trpc } = await import("../lib/trpc");
      const result = await trpc.chat.getProviderKey.query({ provider: "github" });
      if (result) {
        setSavedGh({
          prefix: result.prefix,
          createdAt: new Date(result.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
      }
    } catch {
      // Not logged in
    }
  };
  void checkExistingGh();

  const handleGhSave = async (): Promise<void> => {
    const key = ghToken().trim();
    if (!key) return;
    if (!key.startsWith("ghp_") && !key.startsWith("github_pat_")) {
      setGhMessage({ type: "error", text: "Invalid GitHub token. Should start with ghp_ or github_pat_" });
      return;
    }
    setGhSaving(true);
    setGhMessage(null);
    try {
      const { trpc } = await import("../lib/trpc");
      const result = await trpc.chat.saveProviderKey.mutate({ provider: "github", apiKey: key });
      setSavedGh({ prefix: result.prefix, createdAt: "Just now" });
      setGhToken("");
      setGhMessage({ type: "success", text: "GitHub token saved. Your repos are now accessible." });
      invalidateQueries("provider-keys");
    } catch (err) {
      setGhMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setGhSaving(false);
    }
  };

  const handleGhDelete = async (): Promise<void> => {
    try {
      const { trpc } = await import("../lib/trpc");
      await trpc.chat.deleteProviderKey.mutate({ provider: "github" });
      setSavedGh(null);
      setGhDeleteConfirm(false);
      setGhMessage({ type: "success", text: "GitHub token deleted." });
      invalidateQueries("provider-keys");
    } catch (err) {
      setGhMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    }
  };

  return (
    <SettingsSection title="GitHub Personal Access Token" description="Connect your GitHub account to view repos, PRs, issues, and CI status from within Crontech.">
      <div class="flex flex-col gap-4">
        <Show when={ghMessage()}>
          {(msg) => (
            <div class={`rounded-xl border px-4 py-3 text-xs font-medium ${
              msg().type === "success" ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]" : "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
            }`}>{msg().text}</div>
          )}
        </Show>

        <Show when={savedGh()}>
          {(key) => (
            <div class="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3.5">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in oklab, var(--color-primary-light) 10%, transparent)", color: "var(--color-primary-light)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              </div>
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-[var(--color-text)]">GitHub</span>
                  <span class="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-[9px] font-semibold uppercase text-[var(--color-success)]">Active</span>
                </div>
                <code class="text-xs font-mono text-[var(--color-text-muted)]">{key().prefix}</code>
              </div>
              <span class="hidden text-[11px] text-[var(--color-text-muted)] sm:block">Added {key().createdAt}</span>
              <Show when={!ghDeleteConfirm()} fallback={
                <div class="flex items-center gap-1.5">
                  <button type="button" onClick={() => setGhDeleteConfirm(false)} class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
                  <button type="button" onClick={() => void handleGhDelete()} class="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:brightness-110" style={{ background: "var(--color-danger)", color: "var(--color-text)" }}>Delete</button>
                </div>
              }>
                <button type="button" onClick={() => setGhDeleteConfirm(true)} class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:border-[color-mix(in_oklab,var(--color-danger)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] hover:text-[var(--color-danger)]">Remove</button>
              </Show>
            </div>
          )}
        </Show>

        <div class="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-5">
          <h4 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">{savedGh() ? "Replace Token" : "Add GitHub Token"}</h4>
          <div class="flex items-end gap-3">
            <div class="flex-1">
              <SettingsInput label="GitHub PAT" value={ghToken()} onInput={setGhToken} type="password" placeholder="ghp_xxxxxxxxxxxx" hint="Generate at github.com/settings/tokens (needs repo scope)" />
            </div>
            <button
              type="button"
              disabled={!ghToken().trim() || ghSaving()}
              onClick={() => void handleGhSave()}
              class="shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
            >
              {ghSaving() ? "Saving..." : "Save Token"}
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
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
      invalidateQueries("provider-keys");
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
      invalidateQueries("provider-keys");
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
                  ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]"
                  : "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
              }`}>
                {msg().text}
              </div>
            )}
          </Show>

          {/* Existing key display */}
          <Show when={savedKey()}>
            {(key) => (
              <div class="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3.5">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, var(--color-warning) 10%, transparent)", color: "var(--color-warning)" }}>
                  &#9889;
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-[var(--color-text)]">Anthropic (Claude)</span>
                    <span class="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-[9px] font-semibold uppercase text-[var(--color-success)]">Active</span>
                  </div>
                  <code class="text-xs font-mono text-[var(--color-text-muted)]">{key().prefix}</code>
                </div>
                <div class="hidden flex-col items-end gap-0.5 sm:flex">
                  <span class="text-[11px] text-[var(--color-text-muted)]">Added {key().createdAt}</span>
                </div>
                <Show when={!deleteConfirm()} fallback={
                  <div class="flex items-center gap-1.5">
                    <button type="button" onClick={() => setDeleteConfirm(false)} class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-all hover:text-[var(--color-text)]">Cancel</button>
                    <button type="button" onClick={() => void handleDelete()} class="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:brightness-110" style={{ background: "var(--color-danger)", color: "var(--color-text)" }}>Delete</button>
                  </div>
                }>
                  <button type="button" onClick={() => setDeleteConfirm(true)} class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-all hover:border-[color-mix(in_oklab,var(--color-danger)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] hover:text-[var(--color-danger)]">
                    Remove
                  </button>
                </Show>
              </div>
            )}
          </Show>

          {/* Add new key */}
          <div class="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-5">
            <h4 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">{savedKey() ? "Replace Key" : "Add API Key"}</h4>
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
                class="shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 disabled:opacity-40"
                style={{ background: "var(--color-danger)", color: "var(--color-text)" }}
              >
                {saving() ? "Saving..." : "Save Key"}
              </button>
            </div>
            <p class="mt-3 text-[11px] text-[var(--color-text-faint)]">
              Your key is encrypted at rest. Only the prefix is stored in plaintext for identification.
            </p>
          </div>

          {/* GitHub PAT */}
          <GitHubTokenSection />

          {/* Cost comparison */}
          <div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-5">
            <h4 class="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">Cost Comparison</h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg p-4" style={{ border: "1px solid color-mix(in oklab, var(--color-danger) 10%, transparent)", background: "color-mix(in oklab, var(--color-danger) 5%, transparent)" }}>
                <span class="text-xs text-[var(--color-text-muted)]">Subscriptions</span>
                <div class="mt-1 text-2xl font-bold text-[var(--color-danger)]">$1,800<span class="text-sm font-normal text-[var(--color-text-faint)]">/mo</span></div>
                <span class="text-[10px] text-[var(--color-text-faint)]">Fixed cost, whether you use it or not</span>
              </div>
              <div class="rounded-lg p-4" style={{ border: "1px solid color-mix(in oklab, var(--color-success) 10%, transparent)", background: "color-mix(in oklab, var(--color-success) 5%, transparent)" }}>
                <span class="text-xs text-[var(--color-text-muted)]">API Direct</span>
                <div class="mt-1 text-2xl font-bold text-[var(--color-success)]">Pay-per-use</div>
                <span class="text-[10px] text-[var(--color-text-faint)]">$3/1M input tokens with Sonnet</span>
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
  const auth = useAuth();
  const isAdmin = createMemo((): boolean => auth.currentUser()?.role === "admin");

  const allTabs: { id: SettingsTab; label: string; icon: string; adminOnly?: boolean }[] = [
    { id: "profile", label: "Profile", icon: "&#128100;" },
    { id: "account", label: "Account", icon: "&#128274;" },
    { id: "api-keys", label: "API Keys", icon: "&#128273;" },
    { id: "ai-providers", label: "AI Providers", icon: "&#9889;", adminOnly: true },
    { id: "notifications", label: "Notifications", icon: "&#128276;" },
    { id: "appearance", label: "Appearance", icon: "&#127912;" },
  ];

  const tabs = createMemo(() => allTabs.filter((t) => !t.adminOnly || isAdmin()));

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Settings - Crontech</Title>

      <div class="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div class="mb-8">
          <h1 class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>Settings</h1>
          <p class="mt-1 text-sm text-[var(--color-text-muted)]">Manage your account, security, and preferences</p>
        </div>

        {/* Tab Navigation */}
        <div class="mb-8 flex flex-wrap gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-1.5">
          <For each={tabs()}>
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
          <Match when={activeTab() === "ai-providers" && isAdmin()}>
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
