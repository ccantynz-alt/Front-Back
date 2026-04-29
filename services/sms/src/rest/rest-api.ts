import { z } from "zod";
import type { InboundHandler } from "../inbound/inbound-handler.ts";
import type { DispatchPipeline, SendErrorCode } from "../pipeline/dispatch.ts";
import type { MessageStore } from "../store/message-store.ts";

const SendBody = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  body: z.string(),
  mediaUrls: z.array(z.string().url()).optional(),
  tenantId: z.string().min(1),
  statusWebhook: z.string().url().optional(),
});

export interface RestApiDeps {
  pipeline: DispatchPipeline;
  store: MessageStore;
  inbound: InboundHandler;
  bearerToken: string;
}

/**
 * Hono-free REST surface — uses the Web Fetch API directly so the
 * service can run on Bun, Cloudflare Workers, or Node 20+ without
 * adapter changes.
 */
export class RestApi {
  constructor(private readonly deps: RestApiDeps) {}

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/v1/messages") {
      return this.handleSend(req);
    }
    if (req.method === "GET" && url.pathname.startsWith("/v1/messages/")) {
      return this.handleGet(req, url.pathname.slice("/v1/messages/".length));
    }
    if (req.method === "POST" && url.pathname === "/v1/inbound") {
      return this.handleInbound(req, url);
    }
    return jsonResponse(404, { error: "Not found" });
  }

  private async handleSend(req: Request): Promise<Response> {
    const authError = this.requireAuth(req);
    if (authError !== null) return authError;
    let parsedJson: unknown;
    try {
      parsedJson = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON" });
    }
    const parsed = SendBody.safeParse(parsedJson);
    if (!parsed.success) {
      return jsonResponse(400, { error: "Invalid body", issues: parsed.error.issues });
    }
    const data = parsed.data;
    const result = await this.deps.pipeline.send({
      from: data.from,
      to: data.to,
      body: data.body,
      tenantId: data.tenantId,
      ...(data.mediaUrls !== undefined ? { mediaUrls: data.mediaUrls } : {}),
      ...(data.statusWebhook !== undefined ? { statusWebhook: data.statusWebhook } : {}),
    });
    if (!result.ok) {
      return jsonResponse(httpForCode(result.code), { error: result.error, code: result.code });
    }
    return jsonResponse(202, { messageId: result.messageId, status: "queued" });
  }

  private handleGet(req: Request, messageId: string): Response {
    const authError = this.requireAuth(req);
    if (authError !== null) return authError;
    if (messageId.length === 0) return jsonResponse(400, { error: "Missing messageId" });
    const record = this.deps.store.get(messageId);
    if (!record) return jsonResponse(404, { error: "Message not found" });
    return jsonResponse(200, {
      messageId: record.messageId,
      status: record.status,
      from: record.from,
      to: record.to,
      carrier: record.carrier,
      events: record.events,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private async handleInbound(req: Request, url: URL): Promise<Response> {
    // Inbound webhooks come from carriers and are authenticated by the
    // carrier-specific signature — bearer auth would be wrong here.
    const carrier = url.searchParams.get("carrier");
    if (carrier === null || carrier.length === 0) {
      return jsonResponse(400, { error: "Missing ?carrier=" });
    }
    const signature =
      req.headers.get("X-Crontech-SMS-Signature") ?? req.headers.get("X-Twilio-Signature") ?? "";
    const raw = await req.text();
    const result = await this.deps.inbound.receive(carrier, signature, raw);
    if (!result.ok) {
      const status = result.code === "signature_invalid" ? 401 : 400;
      return jsonResponse(status, { error: result.error, code: result.code });
    }
    return jsonResponse(200, {
      ok: true,
      tenantId: result.tenantId,
      autoSuppressed: result.autoSuppressed,
      forwardedTo: result.forwardedTo ?? null,
    });
  }

  private requireAuth(req: Request): Response | null {
    const header = req.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Missing bearer token" });
    }
    const token = header.slice("Bearer ".length).trim();
    if (token !== this.deps.bearerToken) {
      return jsonResponse(403, { error: "Invalid bearer token" });
    }
    return null;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function httpForCode(code: SendErrorCode): number {
  switch (code) {
    case "from_unregistered":
    case "tenant_mismatch":
      return 403;
    case "missing_sms_capability":
    case "missing_mms_capability":
    case "a2p_violation":
    case "invalid_input":
      return 400;
    case "suppressed_recipient":
      return 409;
    case "rate_limited":
      return 429;
    case "carrier_error":
      return 502;
    default:
      return 500;
  }
}
