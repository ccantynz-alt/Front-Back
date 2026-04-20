import type { APIEvent } from "@solidjs/start/server";

export function GET(_event: APIEvent): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "crontech-web",
      uptime: process.uptime(),
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
