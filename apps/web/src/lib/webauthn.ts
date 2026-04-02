import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

// ── API URL ──────────────────────────────────────────────────────────

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<
      string,
      Record<string, string> | undefined
    >;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return "http://localhost:3001";
}

// ── tRPC HTTP helpers ────────────────────────────────────────────────
// We call tRPC endpoints directly via fetch since the tRPC client
// may not be wired up yet. tRPC mutation format: POST with JSON body.

interface TrpcSuccessResponse<T> {
  result: {
    data: T;
  };
}

interface TrpcErrorResponse {
  error: {
    message: string;
    code: string;
    data?: { code: string };
  };
}

type TrpcResponse<T> = TrpcSuccessResponse<T> | TrpcErrorResponse;

function isTrpcError<T>(
  response: TrpcResponse<T>,
): response is TrpcErrorResponse {
  return "error" in response;
}

async function trpcMutation<TInput, TOutput>(
  procedure: string,
  input: TInput,
): Promise<TOutput> {
  const url = `${getApiUrl()}/api/trpc/${procedure}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: { message: `Request failed with status ${response.status}` },
    }));
    if (isTrpcError(body)) {
      throw new Error(body.error.message);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  const body: TrpcResponse<TOutput> = await response.json();

  if (isTrpcError(body)) {
    throw new Error(body.error.message);
  }

  return body.result.data;
}

async function trpcQuery<TOutput>(
  procedure: string,
  token: string,
): Promise<TOutput> {
  const url = `${getApiUrl()}/api/trpc/${procedure}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: { message: `Request failed with status ${response.status}` },
    }));
    if (isTrpcError(body)) {
      throw new Error(body.error.message);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  const body: TrpcResponse<TOutput> = await response.json();

  if (isTrpcError(body)) {
    throw new Error(body.error.message);
  }

  return body.result.data;
}

// ── Registration ─────────────────────────────────────────────────────

interface RegisterStartResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  userId: string;
}

interface RegisterFinishResponse {
  verified: boolean;
  token: string;
}

export async function registerPasskey(
  email: string,
  displayName: string,
): Promise<{ token: string; userId: string }> {
  // Step 1: Get registration options from the server
  const { options, userId } = await trpcMutation<
    { email: string; displayName: string },
    RegisterStartResponse
  >("auth.register.start", { email, displayName });

  // Step 2: Start the WebAuthn registration ceremony in the browser
  let attestationResponse: RegistrationResponseJSON;
  try {
    attestationResponse = await startRegistration({ optionsJSON: options });
  } catch (err) {
    if (err instanceof Error && err.name === "NotAllowedError") {
      throw new Error(
        "Passkey registration was cancelled or not allowed by the browser.",
      );
    }
    throw new Error(
      "Passkey registration failed. Your browser may not support passkeys.",
    );
  }

  // Step 3: Send the attestation response back to the server for verification
  const { token } = await trpcMutation<
    { userId: string; response: RegistrationResponseJSON },
    RegisterFinishResponse
  >("auth.register.finish", {
    userId,
    response: attestationResponse,
  });

  return { token, userId };
}

// ── Authentication ───────────────────────────────────────────────────

interface LoginStartResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
  userId: string | null;
}

interface LoginFinishResponse {
  verified: boolean;
  token: string;
  userId: string;
}

export async function loginWithPasskey(
  email?: string,
): Promise<{ token: string; userId: string }> {
  // Step 1: Get authentication options from the server
  const input = email ? { email } : undefined;
  const { options, userId } = await trpcMutation<
    { email?: string } | undefined,
    LoginStartResponse
  >("auth.login.start", input);

  // Step 2: Start the WebAuthn authentication ceremony in the browser
  let assertionResponse: AuthenticationResponseJSON;
  try {
    assertionResponse = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    if (err instanceof Error && err.name === "NotAllowedError") {
      throw new Error(
        "Passkey authentication was cancelled or not allowed by the browser.",
      );
    }
    throw new Error(
      "Passkey authentication failed. Your browser may not support passkeys.",
    );
  }

  // Step 3: Send the assertion response back to the server for verification
  const result = await trpcMutation<
    { userId: string | null; response: AuthenticationResponseJSON },
    LoginFinishResponse
  >("auth.login.finish", {
    userId,
    response: assertionResponse,
  });

  return { token: result.token, userId: result.userId };
}

// ── Session verification ─────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
}

export async function verifySession(
  token: string,
): Promise<SessionUser> {
  return trpcQuery<SessionUser>("auth.me", token);
}

// ── Logout ───────────────────────────────────────────────────────────

export async function logoutSession(token: string): Promise<void> {
  const url = `${getApiUrl()}/api/trpc/auth.logout`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  }).catch(() => {
    // Best-effort logout -- always clear local state regardless
  });
}
