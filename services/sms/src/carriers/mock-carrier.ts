import type {
  Carrier,
  CarrierSendInput,
  CarrierSendResult,
  InboundMessage,
  MessageStatus,
} from "../types.ts";

/**
 * Deterministic in-memory carrier for tests. Mirrors the public Carrier
 * contract closely enough that swapping in TwilioCarrier /
 * MessageBirdCarrier / BandwidthCarrier in production v2 is a single
 * import change.
 */
export interface MockCarrierOptions {
  name: string;
  /** Simulated immediate failure for any message body that includes this token. */
  failOnBodyContains?: string;
  /** HMAC-style shared secret for inbound webhook verification. */
  inboundSecret: string;
  /** Initial accept status — defaults to "sending". */
  acceptedStatus?: MessageStatus;
}

export class MockCarrier implements Carrier {
  readonly name: string;
  private readonly failToken: string | undefined;
  private readonly inboundSecret: string;
  private readonly acceptedStatus: MessageStatus;
  private counter = 0;
  /** Records every outbound send for assertions. */
  readonly sent: CarrierSendInput[] = [];

  constructor(opts: MockCarrierOptions) {
    this.name = opts.name;
    this.failToken = opts.failOnBodyContains;
    this.inboundSecret = opts.inboundSecret;
    this.acceptedStatus = opts.acceptedStatus ?? "sending";
  }

  async send(input: CarrierSendInput): Promise<CarrierSendResult> {
    if (this.failToken && input.body.includes(this.failToken)) {
      throw new Error(`Carrier ${this.name} rejected message`);
    }
    this.sent.push({ ...input, mediaUrls: [...input.mediaUrls] });
    this.counter += 1;
    return {
      carrierMessageId: `${this.name}-${this.counter}`,
      acceptedStatus: this.acceptedStatus,
    };
  }

  verifyInboundSignature(rawBody: string, signature: string): boolean {
    // Mock signature scheme: hex(sha256(secret + body)). Real adapters
    // implement Twilio's X-Twilio-Signature, MessageBird's
    // MessageBird-Signature-jwt, and Bandwidth's HMAC-SHA256 schemes.
    const expected = computeMockSignature(this.inboundSecret, rawBody);
    return timingSafeEqual(expected, signature);
  }

  parseInbound(rawBody: string): InboundMessage {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const from = String(parsed["from"] ?? "");
    const to = String(parsed["to"] ?? "");
    const body = String(parsed["body"] ?? "");
    const carrierMessageId = String(parsed["carrierMessageId"] ?? `inbound-${Date.now()}`);
    const mediaRaw = parsed["mediaUrls"];
    const mediaUrls = Array.isArray(mediaRaw)
      ? mediaRaw.filter((m): m is string => typeof m === "string")
      : [];
    if (from.length === 0 || to.length === 0) {
      throw new Error("Inbound payload missing from/to");
    }
    return {
      carrierMessageId,
      from,
      to,
      body,
      mediaUrls,
      receivedAt: Date.now(),
    };
  }

  /** Test helper: produce a valid signature for a given payload. */
  signForTest(rawBody: string): string {
    return computeMockSignature(this.inboundSecret, rawBody);
  }
}

export function computeMockSignature(secret: string, body: string): string {
  // Bun ships node:crypto; use it without a runtime import to avoid
  // pulling node typings into the public bundle.
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(secret);
  hasher.update(body);
  return hasher.digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
