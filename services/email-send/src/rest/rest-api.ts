import { z } from "zod";
import type { SendPipeline } from "../pipeline/send-pipeline.ts";
import type { MessageStore } from "../store.ts";
import { SendMessageInputSchema } from "../types.ts";

export interface RestOptions {
  pipeline: SendPipeline;
  store: MessageStore;
  bearerToken: string;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * REST API. Bun.serve-compatible request handler. No framework dependency
 * keeps cold start microscopic — that's the Mailgun-killer thesis.
 */
export class RestApi {
  constructor(private readonly opts: RestOptions) {}

  authorize(req: Request): boolean {
    const header = req.headers.get("authorization") ?? "";
    if (!header.toLowerCase().startsWith("bearer ")) return false;
    return header.slice(7) === this.opts.bearerToken;
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return json(200, { status: "ok" });
    if (!this.authorize(req)) return json(401, { error: "unauthorized" });

    if (req.method === "POST" && url.pathname === "/v1/messages") {
      return this.postMessage(req);
    }
    const detailMatch = url.pathname.match(/^\/v1\/messages\/([^/]+)$/);
    if (req.method === "GET" && detailMatch) {
      const id = detailMatch[1];
      if (!id) return json(400, { error: "missing-id" });
      return this.getMessage(id);
    }
    const eventsMatch = url.pathname.match(/^\/v1\/messages\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) {
      const id = eventsMatch[1];
      if (!id) return json(400, { error: "missing-id" });
      return this.getEvents(id);
    }
    return json(404, { error: "not-found" });
  }

  private async postMessage(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid-json" });
    }
    const parsed = SendMessageInputSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i: z.ZodIssue) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return json(422, { error: "validation-failed", issues });
    }
    const result = await this.opts.pipeline.accept(parsed.data);
    if (result.status === "rejected") {
      return json(403, {
        error: "rejected",
        reason: result.reason,
        messageId: result.messageId,
      });
    }
    return json(202, {
      id: result.messageId,
      status: result.status,
      recipientsAccepted: result.recipientsAccepted,
      recipientsSuppressed: result.recipientsSuppressed,
    });
  }

  private getMessage(id: string): Response {
    const m = this.opts.store.get(id);
    if (!m) return json(404, { error: "not-found" });
    return json(200, {
      id: m.id,
      tenantId: m.tenantId,
      status: m.status,
      attempts: m.attempts,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      scheduledAt: m.scheduledAt,
      tags: m.input.tags ?? [],
      subject: m.input.subject,
      to: m.input.to,
      from: m.input.from,
    });
  }

  private getEvents(id: string): Response {
    const m = this.opts.store.get(id);
    if (!m) return json(404, { error: "not-found" });
    return json(200, { id, events: m.events });
  }
}
