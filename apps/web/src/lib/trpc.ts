// ── tRPC Client ──────────────────────────────────────────────────────
// Type-safe API client connecting the SolidStart frontend to the
// Hono API server via tRPC. End-to-end type safety with zero codegen.

import { createTRPCClient, httpBatchLink, TRPCClientError, type TRPCClient } from "@trpc/client";
import type { AppRouter } from "@back-to-the-future/api/trpc";

const SESSION_TOKEN_KEY = "btf_session_token";
const CSRF_TOKEN_KEY = "btf_csrf_token";

function getApiUrl(): string {
  // 1. Build-time env var (set via VITE_PUBLIC_API_URL in Pages build settings)
  const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
  const envUrl = meta.env?.VITE_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // 2. In the browser, infer from current origin for same-domain deployments
  //    (e.g. when API is proxied via /api on the same domain or Pages Function)
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    // Production: API lives on api.crontech.ai or same origin /api proxy
    if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
      return "https://api.crontech.ai";
    }
    // Cloudflare Pages preview deployments: use same-origin /api proxy
    if (hostname.endsWith(".pages.dev")) {
      return `${protocol}//${hostname}`;
    }
  }

  // 3. Fallback for local development
  return "http://localhost:3001";
}

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function getCsrfToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CSRF_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCsrfToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CSRF_TOKEN_KEY, token);
  } catch {
    // Storage full or unavailable
  }
}

export function clearCsrfToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CSRF_TOKEN_KEY);
  } catch {
    // Storage unavailable
  }
}

export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/api/trpc`,
      headers() {
        const headers: Record<string, string> = {};

        const token = getSessionToken();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const csrf = getCsrfToken();
        if (csrf) {
          headers["X-CSRF-Token"] = csrf;
        }

        return headers;
      },
    }),
  ],
});

// ── Health Check ─────────────────────────────────────────────────────

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Verify API connectivity on app startup.
 * Calls the health endpoint and returns status + latency.
 */
export async function checkApiHealth(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const result = await trpc.health.query();
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: result.status === "ok",
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const error =
      err instanceof TRPCClientError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return {
      ok: false,
      latencyMs,
      error,
    };
  }
}

/**
 * Fetch a fresh CSRF token from the server.
 * Should be called before auth mutations.
 */
export async function fetchCsrfToken(): Promise<string> {
  const result = await trpc.auth.csrfToken.query();
  setCsrfToken(result.token);
  return result.token;
}

/**
 * Helper to check if an error is a network failure vs a server error.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TRPCClientError) {
    // Network errors typically have no response data
    return err.data === undefined || err.data === null;
  }
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return true;
  }
  return false;
}

export type { AppRouter };
