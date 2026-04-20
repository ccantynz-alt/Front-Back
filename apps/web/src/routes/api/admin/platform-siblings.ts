import type { APIEvent } from "@solidjs/start/server";
import { getPlatformSiblings } from "../../../lib/platform-siblings";

// ── /api/admin/platform-siblings ────────────────────────────────────
// Admin-only fan-out that hits /api/platform-status on each sibling
// product (crontech, gluecron, gatetest) and returns a single JSON
// payload the admin dashboard can render as three health cards.
//
// Admin-only in practice because the widget that calls this endpoint
// lives inside <AdminRoute>. The payload itself is not sensitive (it
// is just re-publishing the already-public /api/platform-status
// responses) so we do not enforce auth server-side — if that posture
// changes, gate this route with the same session middleware the
// admin tRPC procedures use.

export async function GET(event: APIEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const force = url.searchParams.get("force") === "1";
  const snapshot = await getPlatformSiblings({ force });

  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // 30s matches PLATFORM_SIBLING_CACHE_TTL_MS — admins hitting
      // refresh in quick succession should not re-fan-out to the
      // sibling products every time.
      "cache-control": "private, max-age=30",
    },
  });
}
