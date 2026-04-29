// ── git-webhook · standalone server ─────────────────────────────────────
//
// Bun-native entry point. Run with:
//   bun run src/server.ts
//
// Configuration is read from environment variables — never from a
// hard-coded default that could leak credentials. See README for the
// full env-var contract. v1 expects `WEBHOOK_TENANTS_JSON` to contain a
// JSON array of TenantWebhookConfig objects; v2 will pull this from the
// secrets-vault service.

import { z } from "zod";

import { createReceiver } from "./receiver";
import { TenantWebhookConfigSchema } from "./schemas";
import {
  HttpFanoutTransport,
  InProcessTransport,
  type BuildRequestTransport,
} from "./transport";

const EnvSchema = z.object({
  PORT: z
    .string()
    .default("8787")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(65535)),
  WEBHOOK_TENANTS_JSON: z.string().default("[]"),
  // Comma-separated list of HTTP subscribers for BuildRequested fan-out.
  // Empty string disables HTTP fan-out (in-process only).
  BUILD_SUBSCRIBERS: z.string().default(""),
  // Optional shared secret to sign outbound BuildRequested POSTs.
  OUTBOUND_SIGNING_SECRET: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  tenants: ReturnType<typeof TenantWebhookConfigSchema.parse>[];
  subscribers: string[];
  outboundSecret: string | undefined;
} {
  const parsed = EnvSchema.parse(env);
  const tenantArrayRaw: unknown = JSON.parse(parsed.WEBHOOK_TENANTS_JSON);
  if (!Array.isArray(tenantArrayRaw)) {
    throw new Error("WEBHOOK_TENANTS_JSON must be a JSON array");
  }
  const tenants = tenantArrayRaw.map((t) => TenantWebhookConfigSchema.parse(t));
  const subscribers = parsed.BUILD_SUBSCRIBERS
    ? parsed.BUILD_SUBSCRIBERS.split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  return {
    port: parsed.PORT,
    tenants,
    subscribers,
    outboundSecret: parsed.OUTBOUND_SIGNING_SECRET,
  };
}

export function buildTransport(
  subscribers: readonly string[],
  outboundSecret: string | undefined,
): BuildRequestTransport {
  if (subscribers.length === 0) {
    return new InProcessTransport();
  }
  const opts: ConstructorParameters<typeof HttpFanoutTransport>[0] = {
    subscribers,
  };
  if (outboundSecret !== undefined) {
    opts.outboundSecret = outboundSecret;
  }
  return new HttpFanoutTransport(opts);
}

// ── boot ───────────────────────────────────────────────────────────────
// Only run the listener when this file is the program entry point. The
// guard lets tests `import` from this module without forking a server.

if (import.meta.main) {
  const config = loadConfig();
  const transport = buildTransport(config.subscribers, config.outboundSecret);
  const { app, tenantStore } = createReceiver({ transport });
  for (const t of config.tenants) {
    tenantStore.upsert(t);
  }
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      msg: "git-webhook listening",
      port: config.port,
      tenants: config.tenants.length,
      subscribers: config.subscribers.length,
    }),
  );
  Bun.serve({ port: config.port, fetch: app.fetch });
}
