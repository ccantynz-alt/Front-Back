import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createEffect } from "solid-js";
import { useAuth } from "../stores";

interface ProtectedRouteProps {
  children: JSX.Element;
}

export function ProtectedRoute(props: ProtectedRouteProps): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  createEffect((): void => {
    if (!auth.isLoading() && !auth.isAuthenticated()) {
      navigate("/login", { replace: true });
    }
  });

  return (
    <Show
      when={!auth.isLoading() && auth.isAuthenticated()}
      fallback={
        <div class="loading-screen">
          <div class="loading-spinner" />
          <span class="loading-text">Verifying session...</span>
        </div>
      }
    >
      {props.children}
    </Show>
  );
}
