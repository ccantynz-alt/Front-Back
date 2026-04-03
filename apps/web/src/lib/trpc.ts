// ── tRPC Client ──────────────────────────────────────────────────────
// Type-safe API client connecting the SolidStart frontend to the
// Hono API server via tRPC. End-to-end type safety with zero codegen.

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@back-to-the-future/api/trpc";

const SESSION_TOKEN_KEY = "btf_session_token";

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
  }
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

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/api/trpc`,
      headers() {
        const token = getSessionToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export type { AppRouter };
