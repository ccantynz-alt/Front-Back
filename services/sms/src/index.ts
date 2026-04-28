import { A2pRegistry } from "./a2p/a2p-registry.ts";
import {
  BandwidthCarrier,
  CarrierRegistry,
  MessageBirdCarrier,
  TwilioCarrier,
} from "./carriers/index.ts";
import { InboundHandler } from "./inbound/inbound-handler.ts";
import { DispatchPipeline } from "./pipeline/dispatch.ts";
import { PerNumberRateLimiter } from "./rate-limit/rate-limiter.ts";
import { NumberRegistry } from "./registry/number-registry.ts";
import { RestApi } from "./rest/rest-api.ts";
import { MessageStore } from "./store/message-store.ts";
import { SuppressionList } from "./suppression/suppression-list.ts";

export {
  A2pRegistry,
  BandwidthCarrier,
  CarrierRegistry,
  DispatchPipeline,
  InboundHandler,
  MessageBirdCarrier,
  MessageStore,
  NumberRegistry,
  PerNumberRateLimiter,
  RestApi,
  SuppressionList,
  TwilioCarrier,
};
export { MockCarrier } from "./carriers/mock-carrier.ts";
export { detectStopKeyword } from "./suppression/suppression-list.ts";
export type * from "./types.ts";

export interface BootConfig {
  bearerToken: string;
  port: number;
  hostname: string;
  twilioInboundSecret: string;
  messagebirdInboundSecret: string;
  bandwidthInboundSecret: string;
}

export function readConfigFromEnv(env: Record<string, string | undefined> = process.env): BootConfig {
  const bearerToken = env["SMS_TOKEN"] ?? "";
  if (bearerToken.length === 0) {
    throw new Error("SMS_TOKEN is required");
  }
  const portRaw = env["SMS_REST_PORT"] ?? "8790";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid SMS_REST_PORT: ${portRaw}`);
  }
  return {
    bearerToken,
    port,
    hostname: env["SMS_HOSTNAME"] ?? "crontech-sms",
    twilioInboundSecret: env["SMS_TWILIO_INBOUND_SECRET"] ?? "twilio-dev-secret",
    messagebirdInboundSecret: env["SMS_MESSAGEBIRD_INBOUND_SECRET"] ?? "messagebird-dev-secret",
    bandwidthInboundSecret: env["SMS_BANDWIDTH_INBOUND_SECRET"] ?? "bandwidth-dev-secret",
  };
}

export interface BootResult {
  rest: RestApi;
  pipeline: DispatchPipeline;
  store: MessageStore;
  numbers: NumberRegistry;
  a2p: A2pRegistry;
  suppression: SuppressionList;
  rateLimiter: PerNumberRateLimiter;
  carriers: CarrierRegistry;
  inbound: InboundHandler;
  webhookByNumber: Map<string, string>;
}

/**
 * Wire up the in-process SMS service. v2 swaps the mock carriers for
 * real adapters; the REST API and the pipeline never change.
 */
export function bootInProcess(cfg: BootConfig): BootResult {
  const store = new MessageStore();
  const numbers = new NumberRegistry();
  const a2p = new A2pRegistry();
  const suppression = new SuppressionList();
  const rateLimiter = new PerNumberRateLimiter();
  const carriers = new CarrierRegistry();
  carriers.register(new TwilioCarrier(cfg.twilioInboundSecret));
  carriers.register(new MessageBirdCarrier(cfg.messagebirdInboundSecret));
  carriers.register(new BandwidthCarrier(cfg.bandwidthInboundSecret));
  const pipeline = new DispatchPipeline({
    store,
    numbers,
    a2p,
    suppression,
    rateLimiter,
    carriers,
  });
  const webhookByNumber = new Map<string, string>();
  const inbound = new InboundHandler({
    carriers,
    numbers,
    suppression,
    webhookByNumber,
  });
  const rest = new RestApi({
    pipeline,
    store,
    inbound,
    bearerToken: cfg.bearerToken,
  });
  return {
    rest,
    pipeline,
    store,
    numbers,
    a2p,
    suppression,
    rateLimiter,
    carriers,
    inbound,
    webhookByNumber,
  };
}

if (import.meta.main) {
  const cfg = readConfigFromEnv();
  const { rest } = bootInProcess(cfg);
  Bun.serve({
    port: cfg.port,
    fetch: (req) => rest.handle(req),
  });
  console.log(`[sms] REST listening on :${cfg.port}`);
}
