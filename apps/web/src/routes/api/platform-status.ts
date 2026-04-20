import type { APIEvent } from "@solidjs/start/server";

const PRODUCT = "crontech" as const;
const VERSION = process.env.APP_VERSION ?? "dev";
const COMMIT = process.env.GIT_COMMIT ?? "unknown";

const SIBLINGS = {
  crontech: "https://crontech.ai/api/platform-status",
  gluecron: "https://gluecron.com/api/platform-status",
  gatetest: "https://gatetest.io/api/platform-status",
} as const;

export async function GET(_event: APIEvent) {
  const body = {
    product: PRODUCT,
    version: VERSION,
    commit: COMMIT,
    healthy: true,
    timestamp: new Date().toISOString(),
    siblings: SIBLINGS,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
