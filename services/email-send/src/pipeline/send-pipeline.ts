import type { DomainClient } from "../clients/domain-client.ts";
import type { MxResolver } from "../clients/mx-resolver.ts";
import type { SmtpDeliverer } from "../clients/smtp-deliverer.ts";
import type { PriorityQueue } from "../queue/priority-queue.ts";
import type { MessageStore } from "../store.ts";
import type { SuppressionList } from "../suppression/suppression-list.ts";
import type { EventType, SendMessageInput, StoredMessage } from "../types.ts";
import type { WebhookDispatcher } from "../webhooks/webhook-dispatcher.ts";
import { applyDkim } from "./dkim-signer.ts";
import { buildMime } from "./mime-builder.ts";
import { classifySmtpCode, nextDelay } from "./retry-policy.ts";

export interface PipelineOptions {
  store: MessageStore;
  queue: PriorityQueue;
  suppression: SuppressionList;
  domainClient: DomainClient;
  mxResolver: MxResolver;
  deliverer: SmtpDeliverer;
  webhooks: WebhookDispatcher;
  /** Overrideable for tests. */
  now?: () => number;
}

export interface AcceptResult {
  messageId: string;
  status: "queued" | "scheduled" | "suppressed" | "rejected";
  reason?: string;
  recipientsAccepted: string[];
  recipientsSuppressed: string[];
}

function domainOf(addr: string): string {
  const at = addr.lastIndexOf("@");
  return at >= 0 ? addr.slice(at + 1) : addr;
}

export class SendPipeline {
  constructor(private readonly opts: PipelineOptions) {}

  /** Validate, gate against suppression, and enqueue. */
  async accept(input: SendMessageInput): Promise<AcceptResult> {
    // 1. FROM domain validation against the email-domain service.
    const validation = await this.opts.domainClient.validateFromAddress(input.tenantId, input.from);
    if (!validation.ok) {
      const id = crypto.randomUUID();
      return {
        messageId: id,
        status: "rejected",
        reason: validation.reason ?? "from-domain-unverified",
        recipientsAccepted: [],
        recipientsSuppressed: [],
      };
    }

    // 2. Suppression gate.
    const suppressed: string[] = [];
    const accepted: string[] = [];
    for (const r of input.to) {
      if (this.opts.suppression.isSuppressed(input.tenantId, r)) suppressed.push(r);
      else accepted.push(r);
    }
    if (accepted.length === 0) {
      const id = crypto.randomUUID();
      const stored: StoredMessage = {
        id,
        tenantId: input.tenantId,
        input,
        status: "suppressed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: 0,
        events: [],
      };
      this.opts.store.put(stored);
      this.opts.store.appendEvent(id, "suppressed", "all-recipients-suppressed");
      return {
        messageId: id,
        status: "suppressed",
        recipientsAccepted: [],
        recipientsSuppressed: suppressed,
      };
    }

    const id = crypto.randomUUID();
    const filteredInput: SendMessageInput = { ...input, to: accepted };
    const now = (this.opts.now ?? Date.now)();
    const scheduledAt = input.scheduledAt;
    const isScheduled = scheduledAt !== undefined && Date.parse(scheduledAt) > now;
    const stored: StoredMessage = {
      id,
      tenantId: input.tenantId,
      input: filteredInput,
      status: isScheduled ? "scheduled" : "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 0,
      events: [],
      ...(scheduledAt ? { scheduledAt } : {}),
    };
    this.opts.store.put(stored);
    await this.emit(id, "queued");
    for (const sup of suppressed) {
      await this.emit(id, "suppressed", `recipient-suppressed:${sup}`, { recipient: sup });
    }
    this.opts.queue.enqueue({
      messageId: id,
      tenantId: input.tenantId,
      priority: input.priority ?? "normal",
      enqueuedAt: now,
      ...(isScheduled && scheduledAt ? { notBefore: Date.parse(scheduledAt) } : {}),
    });

    return {
      messageId: id,
      status: isScheduled ? "scheduled" : "queued",
      recipientsAccepted: accepted,
      recipientsSuppressed: suppressed,
    };
  }

  /** Drive one queue entry through delivery. Returns true if work happened. */
  async tick(): Promise<boolean> {
    const now = (this.opts.now ?? Date.now)();
    const entry = this.opts.queue.popReady(now);
    if (!entry) return false;
    const message = this.opts.store.get(entry.messageId);
    if (!message) return true;

    this.opts.store.setStatus(message.id, "sending");
    await this.emit(message.id, "sending");

    // DKIM key fetch (cached per send for now; v2: cache).
    const fromDomain = domainOf(message.input.from);
    const signingKey = await this.opts.domainClient.getSigningKey(message.tenantId, fromDomain);

    let anyRetryable = false;

    for (const recipient of message.input.to) {
      // Re-check suppression mid-flight (in case complaint landed).
      if (this.opts.suppression.isSuppressed(message.tenantId, recipient)) {
        await this.emit(message.id, "suppressed", "mid-flight-suppression", { recipient });
        continue;
      }

      const mime = buildMime(message.input, recipient);
      const signed = signingKey ? await applyDkim(mime.raw, signingKey) : mime.raw;

      const recipientDomain = domainOf(recipient);
      const mxRecords = await this.opts.mxResolver.resolve(recipientDomain);
      if (mxRecords.length === 0) {
        await this.emit(message.id, "bounced", `no-mx-for-${recipientDomain}`, {
          recipient,
          smtpCode: 550,
        });
        this.opts.suppression.add(message.tenantId, recipient, "hard-bounce");
        continue;
      }

      const primary = mxRecords[0];
      if (!primary) {
        continue;
      }
      const result = await this.opts.deliverer.deliver({
        recipient,
        raw: signed,
        mx: primary.exchange,
      });

      const cls = classifySmtpCode(result.smtpCode);
      if (cls === "delivered") {
        await this.emit(message.id, "sent", `mx=${primary.exchange}`, {
          recipient,
          smtpCode: result.smtpCode,
        });
        await this.emit(message.id, "delivered", result.message, {
          recipient,
          smtpCode: result.smtpCode,
        });
      } else if (cls === "retry") {
        anyRetryable = true;
        await this.emit(message.id, "dropped", `soft-fail:${result.message}`, {
          recipient,
          smtpCode: result.smtpCode,
        });
      } else {
        await this.emit(message.id, "bounced", result.message, {
          recipient,
          smtpCode: result.smtpCode,
        });
        this.opts.suppression.add(message.tenantId, recipient, "hard-bounce");
      }
    }

    const attempts = this.opts.store.incrementAttempts(message.id);

    if (anyRetryable) {
      const sched = nextDelay(attempts);
      if (sched.give_up) {
        this.opts.store.setStatus(message.id, "bounced");
        await this.emit(message.id, "bounced", "retries-exhausted");
      } else {
        this.opts.store.setStatus(message.id, "queued");
        this.opts.queue.enqueue({
          messageId: message.id,
          tenantId: message.tenantId,
          priority: message.input.priority ?? "normal",
          enqueuedAt: now,
          notBefore: now + sched.delayMs,
        });
      }
    } else {
      const final = this.opts.store.get(message.id);
      const allDelivered = final?.events.some((e) => e.type === "delivered") ?? false;
      this.opts.store.setStatus(message.id, allDelivered ? "delivered" : "bounced");
    }

    return true;
  }

  /** Drain the queue (test helper). */
  async drain(maxIterations: number = 1000): Promise<number> {
    let count = 0;
    for (let i = 0; i < maxIterations; i++) {
      const did = await this.tick();
      if (!did) return count;
      count++;
    }
    return count;
  }

  private async emit(
    messageId: string,
    type: EventType,
    detail?: string,
    extra: { recipient?: string; smtpCode?: number } = {},
  ): Promise<void> {
    const event = this.opts.store.appendEvent(messageId, type, detail, extra);
    if (!event) return;
    const message = this.opts.store.get(messageId);
    if (!message) return;
    await this.opts.webhooks.dispatch(message.tenantId, event);
  }
}
