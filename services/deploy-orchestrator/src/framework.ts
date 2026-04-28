import type { Framework } from "./schemas";

/**
 * Pure function: returns the in-tarball path the edge runtime should
 * boot for a given framework. The orchestrator extracts the tarball,
 * reads this file, and uploads its contents as the bundle code.
 *
 * Adding a new framework here is the canonical extension point — the
 * Zod enum in schemas.ts is the second place to update.
 */
export function frameworkEntrypoint(framework: Framework): string {
  switch (framework) {
    case "solidstart":
      return "dist/server/index.mjs";
    case "nextjs":
      return ".next/standalone/server.js";
    case "remix":
      return "build/server/index.js";
    case "astro":
      return "dist/server/entry.mjs";
    case "sveltekit":
      return "build/index.js";
    case "hono":
      return "dist/index.js";
    case "node":
      return "dist/index.js";
    case "static":
      return "dist/index.html";
  }
}

/**
 * Resolve the entrypoint to load, honouring an explicit override if the
 * artefact specifies one. Validates that override paths cannot escape
 * the bundle root via `..` traversal — defensive, but cheap.
 */
export function resolveEntrypoint(
  framework: Framework,
  override: string | undefined,
): string {
  if (override !== undefined) {
    if (override.includes("..") || override.startsWith("/")) {
      throw new Error(
        `entrypoint override rejected (path traversal): ${override}`,
      );
    }
    return override;
  }
  return frameworkEntrypoint(framework);
}
