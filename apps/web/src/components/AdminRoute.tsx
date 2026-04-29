import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createEffect, onMount } from "solid-js";
import { Box, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

interface AdminRouteProps {
  children: JSX.Element;
  /** Optional fallback shown to authenticated but non-admin users.
   *  Defaults to a "not authorized" message with redirect. */
  fallback?: JSX.Element;
}

/**
 * Wraps a route to enforce admin access.
 * - On mount, verifies the session against the server
 * - Redirects unauthenticated users to /login
 * - Shows "not authorized" for authenticated non-admin users
 * - Only renders children when user.role === "admin"
 */
export function AdminRoute(props: AdminRouteProps): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  onMount(() => {
    auth.checkSession();
  });

  // Redirect unauthenticated users to login
  createEffect((): void => {
    if (!auth.isLoading() && !auth.isAuthenticated()) {
      navigate("/login", { replace: true });
    }
  });

  const isAdmin = (): boolean => {
    const user = auth.currentUser();
    return user?.role === "admin";
  };

  const defaultFallback = (
    <Stack direction="vertical" gap="md" align="center" justify="center" class="min-h-[60vh]">
      <Box
        class="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
        style={{ background: "color-mix(in oklab, var(--color-danger) 10%, transparent)", color: "var(--color-danger)" }}
      >
        &#128274;
      </Box>
      <Text variant="h2" class="text-xl font-bold" style={{ color: "var(--color-text)" }}>Access Denied</Text>
      <Text variant="body" class="max-w-sm text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        This area is restricted to administrators. If you believe this is an error, contact your account administrator.
      </Text>
      <button
        type="button"
        onClick={() => navigate("/dashboard", { replace: true })}
        class="mt-2 rounded-xl border border-[var(--color-border)] px-6 py-2.5 text-sm font-medium transition-all hover:border-[var(--color-border-hover)]"
        style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }}
      >
        Go to Dashboard
      </button>
    </Stack>
  );

  return (
    <Show
      when={!auth.isLoading()}
      fallback={
        <Box class="loading-screen">
          <Box class="loading-spinner" />
          <Text as="span" class="loading-text">Verifying access...</Text>
        </Box>
      }
    >
      <Show
        when={auth.isAuthenticated() && isAdmin()}
        fallback={
          <Show when={auth.isAuthenticated()}>
            {props.fallback ?? defaultFallback}
          </Show>
        }
      >
        {props.children}
      </Show>
    </Show>
  );
}
