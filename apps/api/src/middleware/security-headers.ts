/**
 * Security headers middleware.
 *
 * Sets a comprehensive set of security headers on every response.
 * Aligned with OWASP recommendations and the project's zero-trust
 * security posture.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Security headers middleware.
 *
 * Applied globally — sets HSTS, CSP, Permissions-Policy, and other
 * hardening headers on every response.
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // ── HSTS — enforce HTTPS for 2 years, include subdomains ────
    c.header(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );

    // ── Prevent MIME-type sniffing ──────────────────────────────
    c.header("X-Content-Type-Options", "nosniff");

    // ── Clickjacking protection ────────────────────────────────
    c.header("X-Frame-Options", "DENY");

    // ── Content Security Policy (restrictive default) ──────────
    // API server: only JSON responses, no inline scripts / styles.
    // Downstream web app will have its own, more permissive CSP.
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),
    );

    // ── Permissions Policy — restrict sensitive browser APIs ───
    c.header(
      "Permissions-Policy",
      [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "gyroscope=()",
        "accelerometer=()",
      ].join(", "),
    );

    // ── DNS prefetch — allow for external API calls ────────────
    c.header("X-DNS-Prefetch-Control", "on");

    // ── Referrer — send origin only on cross-origin requests ───
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // ── Cross-Origin isolation headers ─────────────────────────
    c.header("X-Permitted-Cross-Domain-Policies", "none");
  };
}
