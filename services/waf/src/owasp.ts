/**
 * OWASP-style default rule pack.
 *
 * These regex sets are intentionally conservative — false-positive rate is
 * tuned for production traffic. Every pattern has been validated against the
 * OWASP CRS public corpus (paranoia level 1) plus our own deposition test
 * suite. Add a unit test for any new pattern; do not add patterns without
 * a corresponding negative case (a benign payload that must NOT trip).
 */

/** SQL-injection signatures. Case-insensitive. */
export const SQLI_PATTERNS: readonly RegExp[] = [
  /\b(union\s+(all\s+)?select|select\s+.+\s+from)\b/i,
  /\b(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /(?:'|")\s*(?:or|and)\s+(?:'|")?[a-z0-9_]+(?:'|")?\s*=\s*(?:'|")?[a-z0-9_]+/i,
  /;\s*(drop|delete|update|insert|truncate|alter)\s+/i,
  /\b(?:sleep|benchmark|pg_sleep)\s*\(/i,
  /--\s|\/\*|\*\//,
  /\bxp_cmdshell\b/i,
];

/** XSS signatures. Case-insensitive. */
export const XSS_PATTERNS: readonly RegExp[] = [
  /<\s*script[^>]*>/i,
  /<\s*\/\s*script\s*>/i,
  /\bjavascript\s*:/i,
  /\bon(?:click|error|load|mouseover|focus|blur)\s*=/i,
  /<\s*iframe[^>]*>/i,
  /<\s*img[^>]*\bonerror\s*=/i,
  /\bdocument\.cookie\b/i,
  /\beval\s*\(/i,
];

/** Path-traversal signatures. */
export const TRAVERSAL_PATTERNS: readonly RegExp[] = [
  /\.\.[/\\]/,
  /%2e%2e[%2f%5c]/i,
  /%c0%ae%c0%ae/i,
  /\.\.;/,
  /\/etc\/passwd/i,
  /c:\\windows\\system32/i,
];

/**
 * Scanner / pen-test User-Agent blacklist. Match is substring + case-insensitive.
 * These will trigger an immediate deny regardless of route.
 */
export const SCANNER_UA: readonly string[] = [
  "sqlmap",
  "nikto",
  "zgrab",
  "masscan",
  "nmap",
  "acunetix",
  "openvas",
  "nessus",
  "burpsuite",
  "wpscan",
  "dirbuster",
  "gobuster",
  "wfuzz",
  "havij",
];

/**
 * Generic bot UA fragments. Less aggressive than SCANNER_UA — these get
 * rate-limited or marked "bot" rather than denied outright. Whitelisted bots
 * (googlebot, bingbot) are checked separately via ALLOWED_BOTS.
 */
export const BOT_UA: readonly string[] = [
  "bot",
  "crawler",
  "spider",
  "scraper",
  "headless",
  "phantomjs",
  "selenium",
  "puppeteer",
];

/** Bots we explicitly never block — search engines and link previewers. */
export const ALLOWED_BOTS: readonly string[] = [
  "googlebot",
  "bingbot",
  "duckduckbot",
  "yandexbot",
  "baiduspider",
  "slackbot",
  "twitterbot",
  "linkedinbot",
  "facebookexternalhit",
  "applebot",
];

/**
 * Test a single string against a regex set. Returns true on first hit.
 */
export function matchAny(input: string, patterns: readonly RegExp[]): boolean {
  for (const re of patterns) {
    if (re.test(input)) return true;
  }
  return false;
}

/** UA contains check — case-insensitive substring scan. */
export function uaContains(ua: string, fragments: readonly string[]): boolean {
  const lower = ua.toLowerCase();
  for (const frag of fragments) {
    if (lower.includes(frag)) return true;
  }
  return false;
}
