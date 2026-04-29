import { z } from "zod";
import { defaultDispatchers } from "./dispatchers.js";
import { VerifyError, VerifyService } from "./service.js";
import {
  checkVerificationRequestSchema,
  createVerificationRequestSchema,
  magicLinkRequestSchema,
  totpSecretRequestSchema,
} from "./types.js";

export interface ServerConfig {
  authToken: string;
  baseUrl?: string;
  service: VerifyService;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const checkAuth = (req: Request, token: string): boolean => {
  const h = req.headers.get("authorization");
  if (!h) {
    return false;
  }
  const m = /^Bearer\s+(.+)$/iu.exec(h);
  if (!m || !m[1]) {
    return false;
  }
  return m[1] === token;
};

const errorToResponse = (err: unknown): Response => {
  if (err instanceof VerifyError) {
    const status =
      err.code === "rate_limited"
        ? 429
        : err.code === "not_found"
          ? 404
          : err.code === "fraud_blocked"
            ? 403
            : 400;
    return json(status, { error: err.code, message: err.message });
  }
  if (err instanceof z.ZodError) {
    return json(400, { error: "invalid_request", issues: err.issues });
  }
  return json(500, { error: "internal_error", message: (err as Error).message });
};

export function buildHandler(cfg: ServerConfig): (req: Request) => Promise<Response> {
  const baseUrl = cfg.baseUrl ?? "http://localhost:8788";
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return json(200, { ok: true, service: "verify" });
    }
    if (!checkAuth(req, cfg.authToken)) {
      return json(401, { error: "unauthorized" });
    }

    try {
      if (req.method === "POST" && url.pathname === "/v1/verifications") {
        const body = createVerificationRequestSchema.parse(await req.json());
        const out = await cfg.service.createVerification(body);
        return json(201, out);
      }
      const checkMatch = /^\/v1\/verifications\/([^/]+)\/check$/u.exec(url.pathname);
      if (req.method === "POST" && checkMatch) {
        const body = checkVerificationRequestSchema.parse(await req.json());
        const id = checkMatch[1];
        if (!id) {
          return json(400, { error: "invalid_request", message: "missing id" });
        }
        const out = await cfg.service.checkVerification(
          id,
          body.code,
          body.requesterId,
        );
        const status = out.status === "approved" ? 200 : 400;
        return json(status, out);
      }
      const resendMatch = /^\/v1\/verifications\/([^/]+)\/resend$/u.exec(url.pathname);
      if (req.method === "POST" && resendMatch) {
        const id = resendMatch[1];
        if (!id) {
          return json(400, { error: "invalid_request", message: "missing id" });
        }
        const requesterId = req.headers.get("x-requester-id") ?? undefined;
        const out = await cfg.service.resend(id, requesterId);
        return json(200, out);
      }
      if (req.method === "POST" && url.pathname === "/v1/totp/secrets") {
        const body = totpSecretRequestSchema.parse(await req.json());
        const out = cfg.service.setupTotp(body);
        return json(201, out);
      }
      if (req.method === "POST" && url.pathname === "/v1/magic-links") {
        const body = magicLinkRequestSchema.parse(await req.json());
        const out = cfg.service.createMagicLink(body, baseUrl);
        return json(201, out);
      }
      const consumeMatch = /^\/v1\/magic-links\/([^/]+)$/u.exec(url.pathname);
      if (req.method === "GET" && consumeMatch) {
        const id = consumeMatch[1];
        if (!id) {
          return json(400, { error: "invalid_request", message: "missing linkId" });
        }
        const token = url.searchParams.get("token") ?? "";
        const out = cfg.service.consumeMagicLink(id, token);
        return json(out.ok ? 200 : 400, out);
      }
      return json(404, { error: "not_found" });
    } catch (err) {
      return errorToResponse(err);
    }
  };
}

export function startServerFromEnv(): { port: number; stop: () => void } {
  const authToken = process.env.VERIFY_TOKEN;
  if (!authToken) {
    throw new Error("VERIFY_TOKEN is required");
  }
  const hashSecret = process.env.VERIFY_HASH_SECRET ?? authToken;
  const baseUrl = process.env.VERIFY_BASE_URL ?? "http://localhost:8788";
  const service = new VerifyService({
    hashSecret,
    dispatchers: defaultDispatchers({
      ...(process.env.SMS_ENDPOINT ? { smsEndpoint: process.env.SMS_ENDPOINT } : {}),
      ...(process.env.VOICE_ENDPOINT ? { voiceEndpoint: process.env.VOICE_ENDPOINT } : {}),
      ...(process.env.EMAIL_ENDPOINT ? { emailEndpoint: process.env.EMAIL_ENDPOINT } : {}),
    }),
    issuer: process.env.VERIFY_ISSUER ?? "Crontech",
  });
  const handler = buildHandler({ authToken, baseUrl, service });
  const port = Number(process.env.PORT ?? 8788);
  const server = Bun.serve({
    port,
    fetch: handler,
  });
  return { port: server.port ?? port, stop: () => server.stop() };
}

if (import.meta.main) {
  const { port } = startServerFromEnv();
  console.log(`[verify] listening on :${port}`);
}
