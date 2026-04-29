import { A2pRegistry } from "./a2p/a2p-registry.ts";
import { CarrierRegistry, MockCarrier } from "./carriers/index.ts";
import { InboundHandler } from "./inbound/inbound-handler.ts";
import { DispatchPipeline } from "./pipeline/dispatch.ts";
import { PerNumberRateLimiter } from "./rate-limit/rate-limiter.ts";
import { NumberRegistry } from "./registry/number-registry.ts";
import { RestApi } from "./rest/rest-api.ts";
import { MessageStore } from "./store/message-store.ts";
import { SuppressionList } from "./suppression/suppression-list.ts";

export interface Harness {
  store: MessageStore;
  numbers: NumberRegistry;
  a2p: A2pRegistry;
  suppression: SuppressionList;
  rateLimiter: PerNumberRateLimiter;
  carriers: CarrierRegistry;
  pipeline: DispatchPipeline;
  inbound: InboundHandler;
  rest: RestApi;
  twilio: MockCarrier;
  bandwidth: MockCarrier;
  webhookByNumber: Map<string, string>;
  clock: { now: number; tick(ms?: number): void };
  bearerToken: string;
}

export function createHarness(): Harness {
  const clockState = { now: 1_700_000_000_000 };
  const clock = {
    now: clockState.now,
    tick(ms = 0): void {
      clockState.now += ms;
      this.now = clockState.now;
    },
  };
  const tickClock = (): number => clockState.now;
  const limiterClock = { now: () => clockState.now };

  const store = new MessageStore();
  const numbers = new NumberRegistry();
  const a2p = new A2pRegistry();
  const suppression = new SuppressionList();
  const rateLimiter = new PerNumberRateLimiter(limiterClock);
  const carriers = new CarrierRegistry();
  const twilio = new MockCarrier({
    name: "twilio",
    inboundSecret: "secret-twilio",
    failOnBodyContains: "FAIL_THIS",
  });
  const bandwidth = new MockCarrier({
    name: "bandwidth",
    inboundSecret: "secret-bw",
  });
  carriers.register(twilio);
  carriers.register(bandwidth);

  let counter = 0;
  const idGenerator = (): string => {
    counter += 1;
    return `msg_test_${counter}`;
  };

  const pipeline = new DispatchPipeline({
    store,
    numbers,
    a2p,
    suppression,
    rateLimiter,
    carriers,
    idGenerator,
    clock: tickClock,
  });

  const webhookByNumber = new Map<string, string>();
  const inbound = new InboundHandler({
    carriers,
    numbers,
    suppression,
    webhookByNumber,
  });
  const bearerToken = "test-bearer";
  const rest = new RestApi({ pipeline, store, inbound, bearerToken });

  return {
    store,
    numbers,
    a2p,
    suppression,
    rateLimiter,
    carriers,
    pipeline,
    inbound,
    rest,
    twilio,
    bandwidth,
    webhookByNumber,
    clock,
    bearerToken,
  };
}
