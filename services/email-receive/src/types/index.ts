/**
 * Crontech email-receive — shared types.
 *
 * Doctrine: zero-broken-anything, strict types, no any. Every wire boundary
 * has a Zod schema in @see ../api/schemas.ts.
 */

import { z } from "zod";

/** RFC 5322 mailbox: localpart@domain. */
export interface Mailbox {
	readonly address: string;
	readonly name?: string;
}

/** A single MIME header (decoded, RFC 2047 unwrapped). */
export interface ParsedHeader {
	readonly name: string;
	readonly value: string;
}

/** A MIME attachment after decoding. */
export interface ParsedAttachment {
	readonly filename: string;
	readonly contentType: string;
	readonly contentId?: string;
	readonly disposition: "attachment" | "inline";
	readonly size: number;
	/** Raw decoded bytes — base64/quoted-printable already unwound. */
	readonly content: Uint8Array;
}

/** Result of parsing an RFC 5322 message. */
export interface ParsedMessage {
	readonly messageId: string;
	readonly from: Mailbox;
	readonly to: ReadonlyArray<Mailbox>;
	readonly cc: ReadonlyArray<Mailbox>;
	readonly subject: string;
	readonly date: Date;
	readonly inReplyTo?: string;
	readonly references: ReadonlyArray<string>;
	readonly textBody?: string;
	readonly htmlBody?: string;
	readonly attachments: ReadonlyArray<ParsedAttachment>;
	readonly headers: ReadonlyArray<ParsedHeader>;
	readonly rawSize: number;
}

/** SMTP envelope captured during the receive transaction. */
export interface SmtpEnvelope {
	readonly remoteAddress: string;
	readonly heloName: string;
	readonly mailFrom: string;
	readonly rcptTo: ReadonlyArray<string>;
	readonly receivedAt: Date;
	readonly tls: boolean;
}

/** Inbound route — maps a recipient pattern → customer webhook. */
export interface InboundRoute {
	readonly id: string;
	readonly tenantId: string;
	/**
	 * Match pattern. Forms supported:
	 *   - exact:    "support@acme.crontech.dev"
	 *   - wildcard: "support@*.crontech.dev" or "*@acme.crontech.dev"
	 *   - catch-all: "*"
	 */
	readonly pattern: string;
	readonly webhookUrl: string;
	readonly hmacSecret: string;
	readonly enabled: boolean;
	readonly createdAt: Date;
}

export type DeliveryStatus =
	| "pending"
	| "delivered"
	| "retrying"
	| "dead_lettered"
	| "rejected_spam"
	| "no_route";

/** A single inbound event log row. */
export interface InboundEvent {
	readonly id: string;
	readonly tenantId: string;
	readonly messageId: string;
	readonly from: string;
	readonly to: ReadonlyArray<string>;
	readonly subject: string;
	readonly receivedAt: Date;
	readonly spfPass: boolean;
	readonly dkimPass: boolean;
	readonly routedTo: string | null;
	readonly deliveryStatus: DeliveryStatus;
	readonly attempts: number;
	readonly lastError?: string;
}

/** Webhook payload posted to customer endpoints. */
export interface InboundWebhookPayload {
	readonly type: "inbound.email.received";
	readonly tenantId: string;
	readonly routeId: string;
	readonly receivedAt: string;
	readonly envelope: {
		readonly mailFrom: string;
		readonly rcptTo: ReadonlyArray<string>;
		readonly remoteAddress: string;
		readonly tls: boolean;
	};
	readonly authentication: {
		readonly spf: "pass" | "fail" | "neutral";
		readonly dkim: "pass" | "fail" | "neutral";
	};
	readonly message: {
		readonly messageId: string;
		readonly from: Mailbox;
		readonly to: ReadonlyArray<Mailbox>;
		readonly cc: ReadonlyArray<Mailbox>;
		readonly subject: string;
		readonly date: string;
		readonly inReplyTo?: string;
		readonly references: ReadonlyArray<string>;
		readonly textBody?: string;
		readonly htmlBody?: string;
	};
	readonly attachments: ReadonlyArray<{
		readonly filename: string;
		readonly contentType: string;
		readonly disposition: "attachment" | "inline";
		readonly size: number;
		/** base64-encoded content — small attachments only; large ones get a presigned URL in v2. */
		readonly contentBase64: string;
	}>;
}

/** Result returned to the SMTP server after pipeline runs. */
export interface PipelineOutcome {
	readonly accepted: boolean;
	readonly eventId: string | null;
	readonly status: DeliveryStatus;
	readonly reason?: string;
}

export const inboundRouteCreateSchema = z.object({
	tenantId: z.string().min(1).max(64),
	pattern: z.string().min(1).max(255),
	webhookUrl: z.string().url(),
	hmacSecret: z.string().min(16).max(256),
	enabled: z.boolean().default(true),
});

export type InboundRouteCreateInput = z.infer<typeof inboundRouteCreateSchema>;
