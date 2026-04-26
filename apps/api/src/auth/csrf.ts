// ── CSRF Token Management ────────────────────────────────────────────
// Double-submit cookie pattern: server generates a random token,
// client must include it in the X-CSRF-Token header on mutations.
// Tokens are single-use and expire after 15 minutes.

const CSRF_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CsrfEntry {
  token: string;
  expiresAt: number;
}

const csrfStore = new Map<string, CsrfEntry>();

const CLEANUP_THRESHOLD = 1000;

export function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  csrfStore.set(token, {
    token,
    expiresAt: Date.now() + CSRF_TTL_MS,
  });

  if (csrfStore.size > CLEANUP_THRESHOLD) {
    cleanupExpiredCsrfTokens();
  }

  return token;
}

export function validateCsrfToken(token: string | null): boolean {
  if (!token) return false;

  const entry = csrfStore.get(token);
  if (!entry) return false;

  // Single-use: delete after validation attempt
  csrfStore.delete(token);

  if (Date.now() > entry.expiresAt) return false;

  return true;
}

/** Clean up expired CSRF tokens. Exported for testing. */
export function cleanupExpiredCsrfTokens(): number {
  const now = Date.now();
  let cleaned = 0;
  const expiredKeys = Array.from(csrfStore.entries())
    .filter(([, entry]) => now > entry.expiresAt)
    .map(([key]) => key);
  for (const key of expiredKeys) {
    csrfStore.delete(key);
    cleaned++;
  }
  return cleaned;
}

// Periodic cleanup every 60 seconds
setInterval(cleanupExpiredCsrfTokens, 60_000);