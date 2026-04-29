import type { VoiceApi, ApiResponse } from "./api.ts";

/**
 * Thin HTTP adapter wrapping VoiceApi. Uses the Bun-native `fetch`-style
 * server contract — accepts a `Request`, returns a `Response`.
 */
export function createHttpHandler(api: VoiceApi) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");

    const json = async (): Promise<unknown> => {
      try {
        return await req.json();
      } catch {
        return null;
      }
    };

    const respond = (r: ApiResponse) =>
      new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });

    // POST /v1/calls
    if (req.method === "POST" && url.pathname === "/v1/calls") {
      return respond(await api.originate(auth, await json()));
    }
    // POST /v1/inbound
    if (req.method === "POST" && url.pathname === "/v1/inbound") {
      return respond(await api.inbound(auth, await json()));
    }

    const callMatch = url.pathname.match(
      /^\/v1\/calls\/([^/]+)(?:\/(hangup|transfer|play))?$/,
    );
    if (callMatch) {
      const id = callMatch[1]!;
      const action = callMatch[2];
      if (req.method === "GET" && !action) {
        return respond(await api.getCall(auth, id));
      }
      if (req.method === "POST" && action === "hangup") {
        return respond(await api.hangup(auth, id));
      }
      if (req.method === "POST" && action === "transfer") {
        return respond(await api.transferCall(auth, id, await json()));
      }
      if (req.method === "POST" && action === "play") {
        return respond(await api.play(auth, id, await json()));
      }
    }

    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
}
