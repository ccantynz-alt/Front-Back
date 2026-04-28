/**
 * Carrier adapter registry.
 *
 * v1 ships with deterministic mocks for every carrier we plan to
 * integrate. The README tracks the v2 plan for swapping in real
 * implementations:
 *   - TwilioCarrier — REST POST to /Messages.json + X-Twilio-Signature HMAC-SHA1
 *   - MessageBirdCarrier — REST POST to /messages + JWT body signing
 *   - BandwidthCarrier — REST POST to /messages + HMAC-SHA256 signature
 *
 * Every real adapter satisfies the same Carrier interface declared in
 * `../types.ts`, so the pipeline never needs to know which carrier is
 * behind it.
 */
import { MockCarrier } from "./mock-carrier.ts";
import type { Carrier } from "../types.ts";

export { MockCarrier } from "./mock-carrier.ts";

export class TwilioCarrier extends MockCarrier {
  // v2: replace the parent send() with a real fetch to api.twilio.com.
  // Tests verify the contract via the parent MockCarrier behaviour.
  constructor(secret: string) {
    super({ name: "twilio", inboundSecret: secret });
  }
}

export class MessageBirdCarrier extends MockCarrier {
  constructor(secret: string) {
    super({ name: "messagebird", inboundSecret: secret });
  }
}

export class BandwidthCarrier extends MockCarrier {
  constructor(secret: string) {
    super({ name: "bandwidth", inboundSecret: secret });
  }
}

/**
 * Register every carrier the deployment supports keyed by its `name`
 * field. Pipeline lookup is O(1).
 */
export class CarrierRegistry {
  private readonly carriers = new Map<string, Carrier>();

  register(carrier: Carrier): void {
    if (this.carriers.has(carrier.name)) {
      throw new Error(`Carrier already registered: ${carrier.name}`);
    }
    this.carriers.set(carrier.name, carrier);
  }

  get(name: string): Carrier | undefined {
    return this.carriers.get(name);
  }

  list(): string[] {
    return [...this.carriers.keys()];
  }

  require(name: string): Carrier {
    const c = this.carriers.get(name);
    if (!c) throw new Error(`Unknown carrier: ${name}`);
    return c;
  }
}
