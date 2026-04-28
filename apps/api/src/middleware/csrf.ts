import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrf(opts?: { allowedOrigins?: string[] }): MiddlewareHandler {
  const allowedOrigins = opts?.allowedOrigins ?? [];

  return async (c, next): Promise<Response | undefined> => {
    if (SAFE_METHODS.has(c.req.method)) {
      await next();
      return undefined;
    }

    const origin = c.req.header("origin");
    const referer = c.req.header("referer");

    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin && !referer) {
      await next();
      return undefined;
    }

    // Check origin against allowed list
    if (origin) {
      const isAllowed =
        allowedOrigins.length === 0 ||
        allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
        // Allow Cloudflare Pages preview deployments
        origin.endsWith(".pages.dev");
      if (!isAllowed) {
        return c.json({ error: "CSRF validation failed" }, 403);
      }
    }

    await next();
    return undefined;
  };
}
