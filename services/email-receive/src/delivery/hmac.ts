/**
 * HMAC-SHA256 signing for outbound webhook payloads. Customers verify
 * incoming requests via the X-Crontech-Signature and X-Crontech-Timestamp
 * headers. Signature input is `${timestamp}.${rawBody}`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedRequest {
	readonly timestamp: string;
	readonly signature: string;
}

export function signPayload(secret: string, body: string): SignedRequest {
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const signature = computeSignature(secret, timestamp, body);
	return { timestamp, signature };
}

export function computeSignature(
	secret: string,
	timestamp: string,
	body: string,
): string {
	return createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
}

export function verifySignature(
	secret: string,
	timestamp: string,
	body: string,
	provided: string,
): boolean {
	const expected = computeSignature(secret, timestamp, body);
	const a = Buffer.from(expected, "hex");
	const b = Buffer.from(provided, "hex");
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
