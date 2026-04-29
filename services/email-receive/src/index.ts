/**
 * Crontech email-receive — entrypoint.
 *
 * Wires the SMTP listener + REST API + pipeline using in-memory stores by
 * default. apps/api should swap in Drizzle-backed registry + event store.
 */

export { parseMessage, MessageTooLargeError } from "./parser/index.ts";
export { matchRoute, patternMatches } from "./routes/match.ts";
export {
	InMemoryInboundRouteRegistry,
	type InboundRouteRegistry,
} from "./registry/inbound-routes.ts";
export {
	InMemoryInboundEventStore,
	type InboundEventStore,
} from "./log/event-store.ts";
export {
	deliverWebhook,
	computeBackoff,
	type DeliveryReport,
	type DeliveryOptions,
	type WebhookFetcher,
} from "./delivery/webhook.ts";
export {
	signPayload,
	computeSignature,
	verifySignature,
} from "./delivery/hmac.ts";
export {
	MockEmailDomainClient,
	EmailDomainHttpClient,
	type EmailDomainClient,
	type AuthResult,
} from "./clients/email-domain.ts";
export { InboundPipeline, type PipelineConfig } from "./pipeline/index.ts";
export {
	SmtpSession,
	startSmtpListener,
	formatResponse,
	formatMultiline,
	extractAngleAddr,
	type SmtpHandler,
	type SmtpServerOptions,
	type SmtpResponse,
} from "./smtp/server.ts";
export { prefilter, type SpamPrefilterResult } from "./spam/prefilter.ts";
export { createRestApi, type RestApiOptions } from "./api/rest.ts";
export type {
	InboundEvent,
	InboundRoute,
	InboundRouteCreateInput,
	InboundWebhookPayload,
	Mailbox,
	ParsedMessage,
	ParsedAttachment,
	PipelineOutcome,
	SmtpEnvelope,
	DeliveryStatus,
} from "./types/index.ts";

import { MockEmailDomainClient } from "./clients/email-domain.ts";
import { InMemoryInboundEventStore } from "./log/event-store.ts";
import { InboundPipeline } from "./pipeline/index.ts";
import { InMemoryInboundRouteRegistry } from "./registry/inbound-routes.ts";
import { startSmtpListener } from "./smtp/server.ts";

if (import.meta.main) {
	const port = Number(process.env["EMAIL_RECEIVE_SMTP_PORT"] ?? 2525);
	const hostname = process.env["EMAIL_RECEIVE_HOSTNAME"] ?? "mx.crontech.dev";
	const registry = new InMemoryInboundRouteRegistry();
	const events = new InMemoryInboundEventStore();
	const emailDomain = new MockEmailDomainClient({
		spf: "neutral",
		dkim: "neutral",
	});
	const pipeline = new InboundPipeline({
		tenantResolver: (rcpt) => {
			const at = rcpt.lastIndexOf("@");
			if (at < 0) return null;
			return rcpt.slice(at + 1);
		},
		registry,
		events,
		emailDomain,
	});
	const server = await startSmtpListener({
		hostname,
		port,
		handler: pipeline,
	});
	console.log(`email-receive SMTP listening on ${hostname}:${server.port}`);
}
