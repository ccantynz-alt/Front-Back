import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../api/src/trpc/router";

// ── Environment ──────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "btf_session_token";

function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<
      string,
      Record<string, string> | undefined
    >;
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

// ── tRPC Client ──────────────────────────────────────────────────────

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiBaseUrl()}/api/trpc`,
      headers(): Record<string, string> {
        const token = getSessionToken();
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
        return {};
      },
    }),
  ],
});

export type { AppRouter };
