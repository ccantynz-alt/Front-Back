import type { A2pRegistry } from "../a2p/a2p-registry.ts";
import type { CarrierRegistry } from "../carriers/index.ts";
import type { PerNumberRateLimiter } from "../rate-limit/rate-limiter.ts";
import type { NumberRegistry } from "../registry/number-registry.ts";
import type { MessageStore } from "../store/message-store.ts";
import type { SuppressionList } from "../suppression/suppression-list.ts";
import type {
  DeliveryEvent,
  MessageRecord,
  MessageStatus,
  SendRequest,
} from "../types.ts";

export type SendOutcome =
  | { ok: true; messageId: string; status: MessageStatus }
  | { ok: false; error: string; code: SendErrorCode };

export type SendErrorCode =
  | "from_unregistered"
  | "tenant_mismatch"
  | "missing_sms_capability"
  | "missing_mms_capability"
  | "suppressed_recipient"
  | "a2p_violation"
  | "rate_limited"
  | "carrier_error"
  | "invalid_input";

export interface DispatchPipelineDeps {
  store: MessageStore;
  numbers: NumberRegistry;
  a2p: A2pRegistry;
  suppression: SuppressionList;
  rateLimiter: PerNumberRateLimiter;
  carriers: CarrierRegistry;
  idGenerator?: () => string;
  clock?: () => number;
}

/**
 * The send pipeline. Every outbound message flows through this single
 * gate so every guard (registration, A2P, suppression, rate-limit,
 * carrier dispatch) is enforced exactly once.
 */
export class DispatchPipeline {
  private readonly deps: Required<
    Omit<DispatchPipelineDeps, "idGenerator" | "clock">
  > & {
    idGenerator: () => string;
    clock: () => number;
  };

  constructor(deps: DispatchPipelineDeps) {
    this.deps = {
      store: deps.store,
      numbers: deps.numbers,
      a2p: deps.a2p,
      suppression: deps.suppression,
      rateLimiter: deps.rateLimiter,
      carriers: deps.carriers,
      idGenerator: deps.idGenerator ?? defaultIdGenerator,
      clock: deps.clock ?? Date.now,
    };
  }

  async send(req: SendRequest): Promise<SendOutcome> {
    if (req.body.length === 0 && (req.mediaUrls === undefined || req.mediaUrls.length === 0)) {
      return { ok: false, error: "Empty message", code: "invalid_input" };
    }
    const fromNumber = this.deps.numbers.getByE164(req.from);
    if (!fromNumber) {
      return { ok: false, error: `From number not registered: ${req.from}`, code: "from_unregistered" };
    }
    if (fromNumber.tenantId !== req.tenantId) {
      return { ok: false, error: "From number does not belong to tenant", code: "tenant_mismatch" };
    }
    if (!fromNumber.capabilities.sms) {
      return { ok: false, error: "From number lacks SMS capability", code: "missing_sms_capability" };
    }
    const mediaUrls = req.mediaUrls ?? [];
    if (mediaUrls.length > 0 && !fromNumber.capabilities.mms) {
      return { ok: false, error: "From number lacks MMS capability", code: "missing_mms_capability" };
    }
    if (this.deps.suppression.isSuppressed(req.tenantId, req.to)) {
      return { ok: false, error: `Recipient ${req.to} is suppressed`, code: "suppressed_recipient" };
    }
    const a2pError = this.deps.a2p.enforceForSend(fromNumber);
    if (a2pError !== null) {
      return { ok: false, error: a2pError, code: "a2p_violation" };
    }
    if (!this.deps.rateLimiter.tryConsume(fromNumber.e164, fromNumber.type)) {
      return { ok: false, error: `Rate limit exceeded for ${fromNumber.e164}`, code: "rate_limited" };
    }
    const carrier = this.deps.carriers.get(fromNumber.carrier);
    if (!carrier) {
      return { ok: false, error: `Carrier ${fromNumber.carrier} not configured`, code: "carrier_error" };
    }

    const now = this.deps.clock();
    const messageId = this.deps.idGenerator();
    const initialEvent: DeliveryEvent = { ts: now, status: "queued" };
    const record: MessageRecord = {
      messageId,
      tenantId: req.tenantId,
      from: req.from,
      to: req.to,
      body: req.body,
      mediaUrls: [...mediaUrls],
      status: "queued",
      carrier: fromNumber.carrier,
      createdAt: now,
      updatedAt: now,
      events: [initialEvent],
      ...(req.statusWebhook !== undefined ? { statusWebhook: req.statusWebhook } : {}),
    };
    this.deps.store.insert(record);

    try {
      const result = await carrier.send({
        from: req.from,
        to: req.to,
        body: req.body,
        mediaUrls,
      });
      this.deps.store.setCarrierMessageId(messageId, result.carrierMessageId);
      const sendingTs = this.deps.clock();
      const updated = this.deps.store.appendEvent(
        messageId,
        { ts: sendingTs, status: result.acceptedStatus, carrierCode: "ACCEPTED" },
        result.acceptedStatus,
      );
      return { ok: true, messageId, status: updated.status };
    } catch (err) {
      const failTs = this.deps.clock();
      const detail = err instanceof Error ? err.message : String(err);
      this.deps.store.appendEvent(
        messageId,
        { ts: failTs, status: "failed", detail, carrierCode: "CARRIER_REJECT" },
        "failed",
      );
      return { ok: false, error: detail, code: "carrier_error" };
    }
  }

  /**
   * Apply a delivery receipt from a carrier callback. Used by
   * production webhook handlers to advance status from `sending` →
   * `delivered` / `undelivered`.
   */
  applyDeliveryReceipt(
    messageId: string,
    status: MessageStatus,
    detail?: string,
    carrierCode?: string,
  ): MessageRecord {
    const event: DeliveryEvent = {
      ts: this.deps.clock(),
      status,
      ...(detail !== undefined ? { detail } : {}),
      ...(carrierCode !== undefined ? { carrierCode } : {}),
    };
    return this.deps.store.appendEvent(messageId, event, status);
  }
}

let monotonicCounter = 0;

function defaultIdGenerator(): string {
  monotonicCounter += 1;
  return `msg_${Date.now().toString(36)}_${monotonicCounter.toString(36)}`;
}
