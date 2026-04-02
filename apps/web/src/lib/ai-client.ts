// ── AI Client ────────────────────────────────────────────────────────
// HTTP client for AI streaming endpoints. Reads text streams from
// the Hono API and delivers chunks to callers via callbacks.
// All functions attach the Authorization header from localStorage.

// ── Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GenerateUIResult {
  success: boolean;
  ui?: {
    layout: Array<Record<string, unknown>>;
    reasoning: string;
  };
  error?: string;
}

export interface AIClientError {
  type: "auth" | "validation" | "network" | "server";
  message: string;
  status?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "btf_session_token";

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

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function classifyError(status: number, body: string): AIClientError {
  if (status === 401 || status === 403) {
    return { type: "auth", message: "Authentication required", status };
  }
  if (status === 400) {
    try {
      const parsed = JSON.parse(body) as { error?: string };
      return {
        type: "validation",
        message: parsed.error ?? "Invalid request",
        status,
      };
    } catch {
      return { type: "validation", message: "Invalid request", status };
    }
  }
  return { type: "server", message: `Server error (${status})`, status };
}

// ── Stream Reader ────────────────────────────────────────────────────

async function readTextStream(
  response: Response,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: AIClientError) => void,
): Promise<void> {
  const body = response.body;
  if (!body) {
    onError({ type: "network", message: "Response body is empty" });
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const text = decoder.decode(result.value, { stream: !done });
        if (text) {
          onChunk(text);
        }
      }
    }
    onDone();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stream read failed";
    onError({ type: "network", message });
  } finally {
    reader.releaseLock();
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * POST /api/ai/chat — General AI chat with streaming text response.
 * Reads the response body as a ReadableStream, delivering text chunks
 * to the onChunk callback as they arrive.
 */
export async function streamChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (error: AIClientError) => void,
): Promise<void> {
  const handleError = onError ?? ((): void => {});

  try {
    const response = await fetch(`${getApiUrl()}/ai/chat`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const body = await response.text();
      handleError(classifyError(response.status, body));
      return;
    }

    await readTextStream(response, onChunk, onDone, handleError);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network request failed";
    handleError({ type: "network", message });
  }
}

/**
 * POST /api/ai/generate-ui — Generate a validated UI component tree.
 * Returns the full response (not streamed) with component layout + reasoning.
 */
export async function generateUI(
  description: string,
): Promise<GenerateUIResult> {
  try {
    const response = await fetch(`${getApiUrl()}/ai/generate-ui`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const body = await response.text();
      const err = classifyError(response.status, body);
      return { success: false, error: err.message };
    }

    const data = (await response.json()) as GenerateUIResult;
    return data;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network request failed";
    return { success: false, error: message };
  }
}

/**
 * POST /api/ai/site-builder — Site builder agent with streaming.
 * The agent can call tools (search, generate components, analyze code)
 * and streams tokens as they arrive via the text stream protocol.
 */
export async function streamSiteBuilder(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (error: AIClientError) => void,
): Promise<void> {
  const handleError = onError ?? ((): void => {});

  try {
    const response = await fetch(`${getApiUrl()}/ai/site-builder`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const body = await response.text();
      handleError(classifyError(response.status, body));
      return;
    }

    await readTextStream(response, onChunk, onDone, handleError);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network request failed";
    handleError({ type: "network", message });
  }
}
