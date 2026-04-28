import { DomainClient } from "./clients/domain-client.ts";
import { SystemMxResolver } from "./clients/mx-resolver.ts";
import { ScriptedSmtpDeliverer } from "./clients/smtp-deliverer.ts";
import { SendPipeline } from "./pipeline/send-pipeline.ts";
import { PriorityQueue } from "./queue/priority-queue.ts";
import { RestApi } from "./rest/rest-api.ts";
import { StaticAuthenticator } from "./smtp/smtp-server.ts";
import { MessageStore } from "./store.ts";
import { SuppressionList } from "./suppression/suppression-list.ts";
import { WebhookDispatcher } from "./webhooks/webhook-dispatcher.ts";

export {
  DomainClient,
  MessageStore,
  PriorityQueue,
  RestApi,
  ScriptedSmtpDeliverer,
  SendPipeline,
  StaticAuthenticator,
  SuppressionList,
  SystemMxResolver,
  WebhookDispatcher,
};

export interface BootConfig {
  bearerToken: string;
  domainServiceUrl: string;
  restPort: number;
  hostname: string;
}

export function readConfigFromEnv(env: Record<string, string | undefined> = process.env): BootConfig {
  const bearerToken = env["EMAIL_SEND_TOKEN"] ?? "";
  if (bearerToken.length === 0) {
    throw new Error("EMAIL_SEND_TOKEN is required");
  }
  const portRaw = env["EMAIL_SEND_REST_PORT"] ?? "8787";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid EMAIL_SEND_REST_PORT: ${portRaw}`);
  }
  return {
    bearerToken,
    domainServiceUrl: env["EMAIL_DOMAIN_SERVICE_URL"] ?? "http://localhost:8788",
    restPort: port,
    hostname: env["EMAIL_SEND_HOSTNAME"] ?? "crontech-email",
  };
}

/**
 * Boot the in-process service. Production callers swap the deliverer for a
 * real socket-backed SMTP client; tests already exercise the pipeline through
 * the Scripted deliverer.
 */
export function bootInProcess(cfg: BootConfig): {
  pipeline: SendPipeline;
  store: MessageStore;
  rest: RestApi;
  queue: PriorityQueue;
  suppression: SuppressionList;
  webhooks: WebhookDispatcher;
} {
  const store = new MessageStore();
  const queue = new PriorityQueue();
  const suppression = new SuppressionList();
  const webhooks = new WebhookDispatcher();
  const domainClient = new DomainClient(cfg.domainServiceUrl);
  const mxResolver = new SystemMxResolver();
  const deliverer = new ScriptedSmtpDeliverer({});
  const pipeline = new SendPipeline({
    store,
    queue,
    suppression,
    domainClient,
    mxResolver,
    deliverer,
    webhooks,
  });
  const rest = new RestApi({ pipeline, store, bearerToken: cfg.bearerToken });
  return { pipeline, store, rest, queue, suppression, webhooks };
}

if (import.meta.main) {
  const cfg = readConfigFromEnv();
  const { rest } = bootInProcess(cfg);
  Bun.serve({
    port: cfg.restPort,
    fetch: (req) => rest.handle(req),
  });
  console.log(`[email-send] REST listening on :${cfg.restPort}`);
}
