/**
 * Critical CSS utilities for SSR performance.
 *
 * Identifies above-the-fold styles and provides helpers to inline them
 * in the initial HTML response while deferring non-critical CSS.
 */

/**
 * Set of CSS selectors considered critical for above-the-fold rendering.
 * These map to the layout shell, navbar, hero section, and base typography
 * that must render without FOUC.
 */
const CRITICAL_SELECTORS = new Set([
  // Reset and base styles
  "*",
  "*::before",
  "*::after",
  "html",
  "body",
  // Layout shell
  ".layout",
  ".layout-body",
  ".layout-content",
  // Navbar (always above fold)
  ".navbar",
  ".navbar-left",
  ".navbar-right",
  ".navbar-logo",
  ".navbar-links",
  ".nav-link",
  ".nav-link-active",
  // Theme toggle (visible in navbar)
  ".theme-toggle",
  // Hero section
  ".hero",
  ".heading",
  ".tagline",
  ".description",
  // Loading screen (shown during hydration)
  ".loading-screen",
  ".loading-spinner",
  "@keyframes spin",
  // Dark mode variants for above-fold
  "html.dark body",
  "html.dark .navbar",
  "html.dark .nav-link",
  "html.dark .nav-link:hover",
  "html.dark .nav-link-active",
  "html.dark .theme-toggle",
  "html.dark .tagline",
  "html.dark .description",
]);

/**
 * Extracts critical CSS rules from a full stylesheet string.
 * Only rules whose selectors match the critical set are returned.
 *
 * This is intended for build-time or SSR-time extraction. For client-side
 * usage, prefer the browser's native CSS loading with `content-visibility`.
 */
export function extractCriticalCSS(fullCSS: string): {
  critical: string;
  deferred: string;
} {
  const criticalRules: string[] = [];
  const deferredRules: string[] = [];

  // Simple rule-level extraction. Handles top-level rules and @keyframes.
  // For production, integrate with a build-time tool like critters.
  const rulePattern = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match: RegExpExecArray | null;

  while (true) {
    match = rulePattern.exec(fullCSS);
    if (!match) break;
    const selector = match[1].trim();
    const fullRule = match[0];

    // @keyframes and @media blocks with critical selectors
    if (selector.startsWith("@keyframes")) {
      const name = selector.replace("@keyframes", "").trim();
      if (CRITICAL_SELECTORS.has(`@keyframes ${name}`)) {
        criticalRules.push(fullRule);
      } else {
        deferredRules.push(fullRule);
      }
      continue;
    }

    // Check if any selector in a comma-separated list is critical
    const selectors = selector.split(",").map((s) => s.trim());
    const isCritical = selectors.some((s) => CRITICAL_SELECTORS.has(s));

    if (isCritical) {
      criticalRules.push(fullRule);
    } else {
      deferredRules.push(fullRule);
    }
  }

  return {
    critical: criticalRules.join("\n"),
    deferred: deferredRules.join("\n"),
  };
}

/**
 * Creates a `<link>` element that loads CSS without blocking rendering.
 * Uses the print/onload trick for broad browser support.
 *
 * Usage in SSR HTML:
 * ```html
 * <link rel="stylesheet" href="/styles.css" media="print" onload="this.media='all'">
 * ```
 */
export function deferStylesheet(href: string): string {
  return `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${href}"></noscript>`;
}
