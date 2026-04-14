import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createEffect, onMount } from "solid-js";
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
    <div class="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
      >
        &#128274;
      </div>
      <h2 class="text-xl font-bold text-white">Access Denied</h2>
      <p class="max-w-sm text-center text-sm text-gray-500">
        This area is restricted to administrators. If you believe this is an error, contact your account administrator.
      </p>
      <button
        type="button"
        onClick={() => navigate("/dashboard", { replace: true })}
        class="mt-2 rounded-xl bg-white/[0.06] border border-white/[0.08] px-6 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-white/[0.15] hover:text-white"
      >
        Go to Dashboard
      </button>
    </div>
  );

  return (
    <Show
      when={!auth.isLoading()}
      fallback={
        <div class="loading-screen">
          <div class="loading-spinner" />
          <span class="loading-text">Verifying access...</span>
        </div>
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
