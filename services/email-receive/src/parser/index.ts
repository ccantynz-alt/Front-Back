/**
 * Top-level message parser. Combines header + MIME walk into ParsedMessage.
 */

import type { Mailbox, ParsedHeader, ParsedMessage } from "../types/index.ts";
import { parseAddressList, parseSingleAddress } from "./addresses.ts";
import { findHeader, parseHeaders, splitHeadersAndBody } from "./headers.ts";
import { parsePart, walkBodies } from "./mime.ts";

const MAX_MESSAGE_BYTES = 30 * 1024 * 1024;

export class MessageTooLargeError extends Error {
	constructor(public readonly size: number) {
		super(`Message exceeds 30MB limit: ${size} bytes`);
	}
}

export function parseMessage(raw: string): ParsedMessage {
	const rawSize = raw.length;
	if (rawSize > MAX_MESSAGE_BYTES) {
		throw new MessageTooLargeError(rawSize);
	}

	// Parse all headers from top of message for the canonical header table.
	const { headerBlock } = splitHeadersAndBody(raw);
	const headerFields = parseHeaders(headerBlock);

	const messageIdRaw = findHeader(headerFields, "Message-ID")?.rawValue ?? "";
	const messageId =
		messageIdRaw.replace(/^<|>$/g, "").trim() || synthesiseMessageId();

	const fromRaw = findHeader(headerFields, "From")?.rawValue ?? "";
	const from: Mailbox =
		parseSingleAddress(fromRaw) ?? { address: "unknown@invalid" };

	const to: ReadonlyArray<Mailbox> = parseAddressList(
		findHeader(headerFields, "To")?.rawValue ?? "",
	);
	const cc: ReadonlyArray<Mailbox> = parseAddressList(
		findHeader(headerFields, "Cc")?.rawValue ?? "",
	);

	const subject =
		findHeader(headerFields, "Subject")?.decodedValue.trim() ?? "(no subject)";

	const dateRaw = findHeader(headerFields, "Date")?.rawValue ?? "";
	const parsedDate = dateRaw ? new Date(dateRaw) : new Date();
	const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

	const inReplyToRaw = findHeader(headerFields, "In-Reply-To")?.rawValue;
	const inReplyTo = inReplyToRaw
		? inReplyToRaw.replace(/^<|>$/g, "").trim()
		: undefined;

	const referencesRaw = findHeader(headerFields, "References")?.rawValue ?? "";
	const references = referencesRaw
		.split(/\s+/)
		.map((s) => s.replace(/^<|>$/g, "").trim())
		.filter((s) => s.length > 0);

	const root = parsePart(raw);
	const walked = { attachments: [] } as Parameters<typeof walkBodies>[1];
	walkBodies(root, walked);

	const headers: ReadonlyArray<ParsedHeader> = headerFields.map((h) => ({
		name: h.name,
		value: h.decodedValue,
	}));

	const result: ParsedMessage = {
		messageId,
		from,
		to,
		cc,
		subject,
		date,
		...(inReplyTo !== undefined ? { inReplyTo } : {}),
		references,
		...(walked.textBody !== undefined ? { textBody: walked.textBody } : {}),
		...(walked.htmlBody !== undefined ? { htmlBody: walked.htmlBody } : {}),
		attachments: walked.attachments,
		headers,
		rawSize,
	};
	return result;
}

function synthesiseMessageId(): string {
	const rnd = Math.random().toString(36).slice(2, 12);
	return `crontech-inbound-${Date.now()}-${rnd}@email-receive.local`;
}
