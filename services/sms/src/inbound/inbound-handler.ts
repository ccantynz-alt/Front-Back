import type { CarrierRegistry } from "../carriers/index.ts";
import type { NumberRegistry } from "../registry/number-registry.ts";
import { detectStopKeyword, type SuppressionList } from "../suppression/suppression-list.ts";
import type { InboundMessage, PhoneNumberRecord } from "../types.ts";

export type InboundOutcome =
  | {
      ok: true;
      message: InboundMessage;
      tenantId: string;
      autoSuppressed: boolean;
      forwardedTo?: string;
    }
  | { ok: false; error: string; code: InboundErrorCode };

export type InboundErrorCode =
  | "carrier_unknown"
  | "signature_invalid"
  | "payload_invalid"
  | "destination_unregistered";

export interface CustomerWebhookForwarder {
  forward(url: string, payload: InboundMessage, tenantId: string): Promise<void>;
}

export interface InboundHandlerDeps {
  carriers: CarrierRegistry;
  numbers: NumberRegistry;
  suppression: SuppressionList;
  /** Map of E.164 destination → customer-configured webhook URL. */
  webhookByNumber: Map<string, string>;
  forwarder?: CustomerWebhookForwarder;
}

/**
 * Inbound SMS pipeline:
 *   1. Pick the correct carrier adapter from a header / path param.
 *   2. Verify the carrier-specific HMAC signature.
 *   3. Parse the payload into our InboundMessage shape.
 *   4. Auto-suppress on STOP keywords.
 *   5. Forward to the customer's configured webhook for the destination
 *      number.
 */
export class InboundHandler {
  constructor(private readonly deps: InboundHandlerDeps) {}

  async receive(carrierName: string, signature: string, rawBody: string): Promise<InboundOutcome> {
    const carrier = this.deps.carriers.get(carrierName);
    if (!carrier) {
      return { ok: false, error: `Unknown carrier ${carrierName}`, code: "carrier_unknown" };
    }
    if (!carrier.verifyInboundSignature(rawBody, signature)) {
      return { ok: false, error: "Invalid inbound signature", code: "signature_invalid" };
    }
    let parsed: InboundMessage;
    try {
      parsed = carrier.parseInbound(rawBody);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, error: detail, code: "payload_invalid" };
    }
    const destination: PhoneNumberRecord | undefined = this.deps.numbers.getByE164(parsed.to);
    if (!destination) {
      return {
        ok: false,
        error: `Inbound for unregistered destination ${parsed.to}`,
        code: "destination_unregistered",
      };
    }
    let autoSuppressed = false;
    if (detectStopKeyword(parsed.body) !== null) {
      this.deps.suppression.add(destination.tenantId, parsed.from, "STOP");
      autoSuppressed = true;
    }
    const forwardUrl = this.deps.webhookByNumber.get(parsed.to);
    if (forwardUrl !== undefined && this.deps.forwarder !== undefined) {
      await this.deps.forwarder.forward(forwardUrl, parsed, destination.tenantId);
    }
    const out: InboundOutcome = {
      ok: true,
      message: parsed,
      tenantId: destination.tenantId,
      autoSuppressed,
      ...(forwardUrl !== undefined ? { forwardedTo: forwardUrl } : {}),
    };
    return out;
  }
}
