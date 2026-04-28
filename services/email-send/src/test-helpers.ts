import { DomainClient, type FetchLike } from "./clients/domain-client.ts";
import { StaticMxResolver } from "./clients/mx-resolver.ts";
import { ScriptedSmtpDeliverer } from "./clients/smtp-deliverer.ts";
import { SendPipeline } from "./pipeline/send-pipeline.ts";
import { PriorityQueue } from "./queue/priority-queue.ts";
import { MessageStore } from "./store.ts";
import { SuppressionList } from "./suppression/suppression-list.ts";
import { WebhookDispatcher } from "./webhooks/webhook-dispatcher.ts";

export interface DomainServiceState {
  validTenants: Record<string, { domains: string[]; signingKeys: Record<string, string> }>;
}

export function makeDomainFetch(state: DomainServiceState): FetchLike {
  return async (url, init) => {
    const u = new URL(url);
    const path = u.pathname;
    const body = init?.body ? JSON.parse(init.body as string) : {};
    if (path === "/v1/validate") {
      const tenant = state.validTenants[body.tenantId as string];
      const fromDomain = String(body.fromAddress ?? "").split("@")[1] ?? "";
      const ok = !!tenant && tenant.domains.includes(fromDomain);
      return new Response(JSON.stringify({ ok, ...(ok ? {} : { reason: "domain-not-verified" }) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (path === "/v1/dkim-key") {
      const tenant = state.validTenants[body.tenantId as string];
      const domain = body.domain as string;
      const key = tenant?.signingKeys[domain];
      if (!key) return new Response("not found", { status: 404 });
      return new Response(
        JSON.stringify({ domain, selector: "default", privateKeyPem: key }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };
}

export interface HarnessOptions {
  domainState?: DomainServiceState;
  mxRecords?: Record<string, { exchange: string; priority: number }[]>;
  delivererScript?: Record<string, { smtpCode: number; message?: string }>;
  webhookFetcher?: FetchLike;
  now?: () => number;
}

export function makeHarness(opts: HarnessOptions = {}): {
  pipeline: SendPipeline;
  store: MessageStore;
  queue: PriorityQueue;
  suppression: SuppressionList;
  webhooks: WebhookDispatcher;
  deliverer: ScriptedSmtpDeliverer;
} {
  const store = new MessageStore();
  const queue = new PriorityQueue();
  const suppression = new SuppressionList();
  const webhooks = new WebhookDispatcher(opts.webhookFetcher);
  const domainState = opts.domainState ?? {
    validTenants: {
      "tenant-a": {
        domains: ["sender.example"],
        signingKeys: { "sender.example": "PRIVATE-KEY-PEM" },
      },
    },
  };
  const domainClient = new DomainClient("http://domain.test", makeDomainFetch(domainState));
  const mxResolver = new StaticMxResolver(
    opts.mxRecords ?? {
      "recipient.example": [{ exchange: "mx1.recipient.example", priority: 10 }],
      "bouncy.example": [{ exchange: "mx1.bouncy.example", priority: 10 }],
      "soft.example": [{ exchange: "mx1.soft.example", priority: 10 }],
    },
  );
  const deliverer = new ScriptedSmtpDeliverer(opts.delivererScript ?? {});
  const pipeline = new SendPipeline({
    store,
    queue,
    suppression,
    domainClient,
    mxResolver,
    deliverer,
    webhooks,
    ...(opts.now ? { now: opts.now } : {}),
  });
  return { pipeline, store, queue, suppression, webhooks, deliverer };
}
