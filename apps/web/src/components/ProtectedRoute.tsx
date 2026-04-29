import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createEffect, onMount } from "solid-js";
import { Box, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

interface ProtectedRouteProps {
  children: JSX.Element;
}

/**
 * Wraps a route to enforce authentication.
 * - On mount, verifies the session against the server (checkSession)
 * - Reactively redirects to /login when the user is not authenticated
 * - Shows a loading spinner while session validation is in progress
 */
export function ProtectedRoute(props: ProtectedRouteProps): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  // On mount, always re-validate the session against the server
  // This catches expired or revoked sessions that localStorage might still hold
  onMount(() => {
    auth.checkSession();
  });

  createEffect((): void => {
    if (!auth.isLoading() && !auth.isAuthenticated()) {
      navigate("/login", { replace: true });
    }
  });

  return (
    <Show
      when={!auth.isLoading() && auth.isAuthenticated()}
      fallback={
        <Box class="loading-screen">
          <Box class="loading-spinner" />
          <Text as="span" class="loading-text">Verifying session...</Text>
        </Box>
      }
    >
      {props.children}
    </Show>
  );
}
