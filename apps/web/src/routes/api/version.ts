// ── Deploy Version Probe (Web SSR) ──────────────────────────────────
// Mirrors /api/version on the API server. The GitHub Actions deploy
// workflow polls both after `docker compose up` to confirm the *new*
// web image is actually serving traffic — otherwise a silent cache or
// stale container can make a "successful" deploy look live while the
// old SHA keeps answering requests.
//
// GIT_SHA is baked into the container at build time via the Dockerfile
// ARG, so this is a pure SSR read of process.env with no DB/network
// dependencies — keep it fast, keep it uncached.

import type { APIEvent } from "@solidjs/start/server";

export function GET(_event: APIEvent): Response {
  const sha = process.env.GIT_SHA ?? "unknown";
  return new Response(
    JSON.stringify({
      sha,
      service: "crontech-web",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}
