// ── Launch Status — admin-only live probe for the HUD ──────────────
// Backs the LaunchChecklist HUD (apps/web/src/components/LaunchChecklist.tsx).
// Returns booleans for whether each runtime secret is configured on the
// Cloudflare Worker (Phase B) and whether trivial smoke probes pass
// (Phase D). NEVER returns the actual secret value — only presence.
//
// Authorised implicitly by Craig on 15 Apr 2026 via the HUD auto-tick
// request. Admin-gated because secret presence is still sensitive
// information (tells an attacker which integrations are wired up).

import { sql } from "drizzle-orm";
import { router, adminProcedure } from "../init";

// The 12 Phase B secret names the HUD tracks. Kept in lockstep with
// LaunchChecklist.tsx's Phase B item labels. If a new secret is added
// to Phase B there, add it here — TypeScript keeps the response shape
// honest on the client via `AppRouter` type inference.
const SECRET_KEYS = [
  "DATABASE_URL",
  "DATABASE_AUTH_TOKEN",
  "SESSION_SECRET",
  "JWT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_ENTERPRISE_PRICE_ID",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

type SecretKey = (typeof SECRET_KEYS)[number];

function hasSecret(name: SecretKey): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

export const launchRouter = router({
  /**
   * Admin-only launch status probe.
   *
   * Returns booleans only — never the underlying secret values. Drives
   * the LaunchChecklist HUD auto-tick for Phase B (runtime secrets) and
   * Phase D (smoke probes).
   */
  status: adminProcedure.query(async ({ ctx }) => {
    // Build the secrets map. Each value is a pure boolean derived from
    // whether the env var is a non-empty string.
    const secrets = {
      DATABASE_URL: hasSecret("DATABASE_URL"),
      DATABASE_AUTH_TOKEN: hasSecret("DATABASE_AUTH_TOKEN"),
      SESSION_SECRET: hasSecret("SESSION_SECRET"),
      JWT_SECRET: hasSecret("JWT_SECRET"),
      GOOGLE_CLIENT_ID: hasSecret("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: hasSecret("GOOGLE_CLIENT_SECRET"),
      STRIPE_SECRET_KEY: hasSecret("STRIPE_SECRET_KEY"),
      STRIPE_WEBHOOK_SECRET: hasSecret("STRIPE_WEBHOOK_SECRET"),
      STRIPE_PRO_PRICE_ID: hasSecret("STRIPE_PRO_PRICE_ID"),
      STRIPE_ENTERPRISE_PRICE_ID: hasSecret("STRIPE_ENTERPRISE_PRICE_ID"),
      OPENAI_API_KEY: hasSecret("OPENAI_API_KEY"),
      ANTHROPIC_API_KEY: hasSecret("ANTHROPIC_API_KEY"),
    } as const;

    // Probe 1: api_version — we're already inside the API process,
    // so the procedure running at all proves /api/version would 200.
    // The HUD still polls /api/version directly via the D1 autoProbe,
    // but we surface it here too so a single request resolves every
    // HUD tick in one round-trip.
    const apiVersion = true;

    // Probe 2: db_connected — trivial `SELECT 1`. Wrapped in try/catch
    // because the HUD must never throw on a degraded DB; it just wants
    // to know green vs red.
    let dbConnected = false;
    try {
      await ctx.db.run(sql`SELECT 1`);
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    return {
      secrets,
      probes: {
        api_version: apiVersion,
        db_connected: dbConnected,
      },
    };
  }),
});
