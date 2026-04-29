/**
 * Inbound pipeline: receive → parse → SPF → DKIM → route lookup →
 * spam pre-filter → webhook deliver → log update.
 *
 * Extension point: classifyAttachments — placeholder hook that future v2
 * code will populate with AI-driven attachment classification (malware,
 * invoice, contract, etc.). Currently a no-op.
 */

import type { EmailDomainClient } from "../clients/email-domain.ts";
import type { DeliveryOptions } from "../delivery/webhook.ts";
import { deliverWebhook } from "../delivery/webhook.ts";
import type { InboundEventStore } from "../log/event-store.ts";
import { parseMessage } from "../parser/index.ts";
import type { InboundRouteRegistry } from "../registry/inbound-routes.ts";
import { matchRoute } from "../routes/match.ts";
import type { SmtpHandler } from "../smtp/server.ts";
import { prefilter } from "../spam/prefilter.ts";
import type {
	InboundEvent,
	InboundWebhookPayload,
	PipelineOutcome,
	SmtpEnvelope,
} from "../types/index.ts";

export interface PipelineConfig {
	readonly tenantResolver: (rcpt: string) => string | null;
	readonly registry: InboundRouteRegistry;
	readonly events: InboundEventStore;
	readonly emailDomain: EmailDomainClient;
	readonly delivery?: DeliveryOptions;
	/** Hook for v2 AI attachment classification. */
	readonly classifyAttachments?: (
		attachments: ReadonlyArray<{ filename: string; contentType: string }>,
	) => Promise<void>;
}

export class InboundPipeline implements SmtpHandler {
	constructor(private readonly cfg: PipelineConfig) {}

	async onMessage(envelope: SmtpEnvelope, raw: string): Promise<void> {
		await this.process(envelope, raw);
	}

	async process(envelope: SmtpEnvelope, raw: string): Promise<PipelineOutcome> {
		const message = parseMessage(raw);

		const spfResult = await this.cfg.emailDomain.checkSpf({
			mailFrom: envelope.mailFrom,
			remoteAddress: envelope.remoteAddress,
			heloName: envelope.heloName,
		});
		const dkimResult = await this.cfg.emailDomain.checkDkim({
			rawMessage: raw,
		});

		const spfPass = spfResult === "pass";
		const dkimPass = dkimResult === "pass";

		// Resolve tenant from primary RCPT TO. If multiple RCPTs land in different
		// tenants, the pipeline records one event per tenant — but for v1 we keep
		// it simple: pick the first RCPT, resolve its tenant.
		const primaryRcpt = envelope.rcptTo[0];
		if (primaryRcpt === undefined) {
			return this.recordRejection(envelope, message, "no_route", null, "no recipients");
		}
		const tenantId = this.cfg.tenantResolver(primaryRcpt);
		if (tenantId === null) {
			return this.recordRejection(
				envelope,
				message,
				"no_route",
				null,
				`no tenant owns ${primaryRcpt}`,
			);
		}

		const route = matchRoute(
			this.cfg.registry.listByTenant(tenantId),
			tenantId,
			primaryRcpt,
		);
		if (route === null) {
			return this.recordRejection(
				envelope,
				message,
				"no_route",
				tenantId,
				`no route matched ${primaryRcpt}`,
			);
		}

		const spam = prefilter(message);
		if (spam.isSpam) {
			const event = this.cfg.events.append({
				tenantId,
				messageId: message.messageId,
				from: message.from.address,
				to: message.to.map((m) => m.address),
				subject: message.subject,
				receivedAt: envelope.receivedAt,
				spfPass,
				dkimPass,
				routedTo: route.id,
				deliveryStatus: "rejected_spam",
				attempts: 0,
				lastError: `spam score ${spam.score}: ${spam.signals.map((s) => s.reason).join(", ")}`,
			});
			return { accepted: false, eventId: event.id, status: "rejected_spam" };
		}

		if (this.cfg.classifyAttachments !== undefined) {
			await this.cfg.classifyAttachments(
				message.attachments.map((a) => ({
					filename: a.filename,
					contentType: a.contentType,
				})),
			);
		}

		const event = this.cfg.events.append({
			tenantId,
			messageId: message.messageId,
			from: message.from.address,
			to: message.to.map((m) => m.address),
			subject: message.subject,
			receivedAt: envelope.receivedAt,
			spfPass,
			dkimPass,
			routedTo: route.id,
			deliveryStatus: "pending",
			attempts: 0,
		});

		const payload: InboundWebhookPayload = {
			type: "inbound.email.received",
			tenantId,
			routeId: route.id,
			receivedAt: envelope.receivedAt.toISOString(),
			envelope: {
				mailFrom: envelope.mailFrom,
				rcptTo: envelope.rcptTo,
				remoteAddress: envelope.remoteAddress,
				tls: envelope.tls,
			},
			authentication: {
				spf: spfResult,
				dkim: dkimResult,
			},
			message: {
				messageId: message.messageId,
				from: message.from,
				to: message.to,
				cc: message.cc,
				subject: message.subject,
				date: message.date.toISOString(),
				...(message.inReplyTo !== undefined
					? { inReplyTo: message.inReplyTo }
					: {}),
				references: message.references,
				...(message.textBody !== undefined ? { textBody: message.textBody } : {}),
				...(message.htmlBody !== undefined ? { htmlBody: message.htmlBody } : {}),
			},
			attachments: message.attachments.map((a) => ({
				filename: a.filename,
				contentType: a.contentType,
				disposition: a.disposition,
				size: a.size,
				contentBase64: Buffer.from(a.content).toString("base64"),
			})),
		};

		const report = await deliverWebhook(route, payload, this.cfg.delivery);
		const finalStatus = report.delivered
			? "delivered"
			: report.deadLettered
				? "dead_lettered"
				: "retrying";
		const lastError = report.attempts[report.attempts.length - 1]?.error;
		this.cfg.events.updateStatus(event.id, finalStatus, {
			attempts: report.attempts.length,
			...(lastError !== undefined ? { lastError } : {}),
		});

		return {
			accepted: report.delivered,
			eventId: event.id,
			status: finalStatus,
		};
	}

	private recordRejection(
		envelope: SmtpEnvelope,
		message: ReturnType<typeof parseMessage>,
		status: "no_route",
		tenantId: string | null,
		reason: string,
	): PipelineOutcome {
		let event: InboundEvent | null = null;
		if (tenantId !== null) {
			event = this.cfg.events.append({
				tenantId,
				messageId: message.messageId,
				from: message.from.address,
				to: message.to.map((m) => m.address),
				subject: message.subject,
				receivedAt: envelope.receivedAt,
				spfPass: false,
				dkimPass: false,
				routedTo: null,
				deliveryStatus: status,
				attempts: 0,
				lastError: reason,
			});
		}
		return {
			accepted: false,
			eventId: event?.id ?? null,
			status,
			reason,
		};
	}
}
