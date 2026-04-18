import { createSignal, createResource, Show, For, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Text, Badge, Stack } from "@back-to-the-future/ui";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: "system" | "billing" | "collaboration" | "ai";
  title: string;
  message: string;
  read: boolean;
  createdAt: Date | string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function typeLabel(type: Notification["type"]): string {
  const labels: Record<Notification["type"], string> = {
    system: "System",
    billing: "Billing",
    collaboration: "Collab",
    ai: "AI",
  };
  return labels[type];
}

function typeBadgeVariant(type: Notification["type"]): "default" | "success" | "warning" | "error" {
  const variants: Record<Notification["type"], "default" | "success" | "warning" | "error"> = {
    system: "default",
    billing: "warning",
    collaboration: "success",
    ai: "default",
  };
  return variants[type];
}

function formatTimeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

// ── NotificationCenter ───────────────────────────────────────────────

export function NotificationCenter(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [unread, { refetch }] = createResource(
    () => trpc.notifications.getUnread.query().catch(() => [] as Notification[]),
  );

  // Poll for new notifications every 60s
  const pollInterval = setInterval(() => {
    refetch();
  }, 60_000);
  onCleanup(() => clearInterval(pollInterval));

  const unreadCount = (): number => (unread() ?? []).length;

  const handleMarkRead = async (id: string): Promise<void> => {
    try {
      await trpc.notifications.markRead.mutate({ id });
      refetch();
    } catch {
      // Silent failure
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    try {
      await trpc.notifications.markAllRead.mutate();
      refetch();
    } catch {
      // Silent failure
    }
  };

  // Close dropdown when clicking outside
  const handleClickOutside = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (!target.closest(".notification-center")) {
      setOpen(false);
    }
  };

  if (typeof window !== "undefined") {
    document.addEventListener("click", handleClickOutside);
    onCleanup(() => document.removeEventListener("click", handleClickOutside));
  }

  return (
    <div class="notification-center" style={{ position: "relative" }}>
      {/* Bell Button */}
      <button
        type="button"
        class="notification-bell"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open());
        }}
        aria-label={`Notifications${unreadCount() > 0 ? ` (${unreadCount()} unread)` : ""}`}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          "font-size": "18px",
          padding: "6px",
          color: "var(--color-text)",
        }}
      >
        <span aria-hidden="true">&#128276;</span>
        <Show when={unreadCount() > 0}>
          <span
            style={{
              position: "absolute",
              top: "0",
              right: "0",
              background: "var(--color-danger)",
              color: "var(--color-text)",
              "font-size": "10px",
              "font-weight": "bold",
              "border-radius": "50%",
              width: "16px",
              height: "16px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "line-height": "1",
            }}
          >
            {unreadCount() > 9 ? "9+" : unreadCount()}
          </span>
        </Show>
      </button>

      {/* Dropdown */}
      <Show when={open()}>
        <div
          class="notification-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            right: "0",
            width: "360px",
            "max-height": "420px",
            "overflow-y": "auto",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            "border-radius": "8px",
            "box-shadow": "0 8px 24px rgba(0,0,0,0.12)",
            "z-index": "100",
            "margin-top": "8px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              "border-bottom": "1px solid var(--color-border)",
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
            }}
          >
            <Text variant="body" weight="semibold">Notifications</Text>
            <Show when={unreadCount() > 0}>
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                Mark all read
              </Button>
            </Show>
          </div>

          {/* Notification List */}
          <Show
            when={unreadCount() > 0}
            fallback={
              <div style={{ padding: "24px 16px", "text-align": "center" }}>
                <Text variant="body" class="text-muted">No unread notifications.</Text>
              </div>
            }
          >
            <div>
              <For each={unread() ?? []}>
                {(notif) => (
                  <div
                    style={{
                      padding: "12px 16px",
                      "border-bottom": "1px solid var(--color-border)",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onClick={() => handleMarkRead(notif.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleMarkRead(notif.id);
                    }}
                  >
                    <Stack direction="vertical" gap="xs">
                      <Stack direction="horizontal" gap="sm" align="center">
                        <Badge variant={typeBadgeVariant(notif.type)} size="sm">
                          {typeLabel(notif.type)}
                        </Badge>
                        <Text variant="caption" class="text-muted">
                          {formatTimeAgo(notif.createdAt)}
                        </Text>
                      </Stack>
                      <Text variant="body" weight="semibold">{notif.title}</Text>
                      <Text variant="caption" class="text-muted">{notif.message}</Text>
                    </Stack>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
