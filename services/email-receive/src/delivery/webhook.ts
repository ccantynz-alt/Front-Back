/**
 * Webhook delivery with exponential backoff retry. Designed for sub-second
 * delivery on the happy path; retry up to 24h on 5xx; dead-letter after.
 *
 * The transport is injectable so tests can supply a mock fetch and a fake
 * clock without spinning up a real HTTP listener.
 */

import type {
	InboundRoute,
	InboundWebhookPayload,
} from "../types/index.ts";
import { signPayload } from "./hmac.ts";

export interface HttpResponseLike {
	readonly status: number;
	readonly body: string;
}

export type WebhookFetcher = (
	url: string,
	init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<HttpResponseLike>;

export interface DeliveryAttempt {
	readonly attempt: number;
	readonly status: number | "network_error";
	readonly delayMs: number;
	readonly error?: string;
	readonly succeededAt?: number;
}

export interface DeliveryReport {
	readonly delivered: boolean;
	readonly deadLettered: boolean;
	readonly attempts: ReadonlyArray<DeliveryAttempt>;
	readonly totalElapsedMs: number;
}

export interface DeliveryOptions {
	readonly maxAttempts?: number;
	readonly initialBackoffMs?: number;
	readonly maxBackoffMs?: number;
	readonly maxTotalMs?: number;
	readonly fetcher?: WebhookFetcher;
	readonly sleep?: (ms: number) => Promise<void>;
	readonly now?: () => number;
}

const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 30 * 60 * 1000;
const DEFAULT_MAX_TOTAL_MS = 24 * 60 * 60 * 1000;

const defaultFetcher: WebhookFetcher = async (url, init) => {
	const res = await fetch(url, init);
	const body = await res.text();
	return { status: res.status, body };
};

const defaultSleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function deliverWebhook(
	route: InboundRoute,
	payload: InboundWebhookPayload,
	options: DeliveryOptions = {},
): Promise<DeliveryReport> {
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const initialBackoffMs =
		options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
	const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
	const maxTotalMs = options.maxTotalMs ?? DEFAULT_MAX_TOTAL_MS;
	const fetcher = options.fetcher ?? defaultFetcher;
	const sleep = options.sleep ?? defaultSleep;
	const now = options.now ?? Date.now;

	const body = JSON.stringify(payload);
	const attempts: DeliveryAttempt[] = [];
	const start = now();

	for (let i = 1; i <= maxAttempts; i++) {
		const elapsed = now() - start;
		if (elapsed >= maxTotalMs) break;
		const { timestamp, signature } = signPayload(route.hmacSecret, body);
		try {
			const res = await fetcher(route.webhookUrl, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"user-agent": "crontech-email-receive/1.0",
					"x-crontech-signature": signature,
					"x-crontech-timestamp": timestamp,
					"x-crontech-event-type": payload.type,
					"x-crontech-route-id": route.id,
				},
				body,
			});
			if (res.status >= 200 && res.status < 300) {
				attempts.push({
					attempt: i,
					status: res.status,
					delayMs: 0,
					succeededAt: now(),
				});
				return {
					delivered: true,
					deadLettered: false,
					attempts,
					totalElapsedMs: now() - start,
				};
			}
			if (res.status >= 400 && res.status < 500 && res.status !== 429) {
				attempts.push({
					attempt: i,
					status: res.status,
					delayMs: 0,
					error: `4xx: ${res.body.slice(0, 200)}`,
				});
				return {
					delivered: false,
					deadLettered: true,
					attempts,
					totalElapsedMs: now() - start,
				};
			}
			const delay = computeBackoff(i, initialBackoffMs, maxBackoffMs);
			attempts.push({
				attempt: i,
				status: res.status,
				delayMs: delay,
				error: `retryable: ${res.status}`,
			});
			if (i === maxAttempts) break;
			await sleep(delay);
		} catch (err) {
			const delay = computeBackoff(i, initialBackoffMs, maxBackoffMs);
			attempts.push({
				attempt: i,
				status: "network_error",
				delayMs: delay,
				error: err instanceof Error ? err.message : String(err),
			});
			if (i === maxAttempts) break;
			await sleep(delay);
		}
	}
	return {
		delivered: false,
		deadLettered: true,
		attempts,
		totalElapsedMs: now() - start,
	};
}

export function computeBackoff(
	attempt: number,
	initial: number,
	max: number,
): number {
	const exp = Math.min(initial * 2 ** (attempt - 1), max);
	const jitter = Math.random() * 0.2 * exp;
	return Math.floor(exp + jitter);
}
