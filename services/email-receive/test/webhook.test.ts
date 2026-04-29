import { describe, expect, it } from "bun:test";
import {
	computeBackoff,
	deliverWebhook,
	type HttpResponseLike,
	type WebhookFetcher,
} from "../src/delivery/webhook.ts";
import {
	computeSignature,
	signPayload,
	verifySignature,
} from "../src/delivery/hmac.ts";
import type {
	InboundRoute,
	InboundWebhookPayload,
} from "../src/types/index.ts";

const route: InboundRoute = {
	id: "r1",
	tenantId: "t1",
	pattern: "a@b.com",
	webhookUrl: "https://hooks.example.com/inbound",
	hmacSecret: "supersecretkey1234567890",
	enabled: true,
	createdAt: new Date(),
};

const payload: InboundWebhookPayload = {
	type: "inbound.email.received",
	tenantId: "t1",
	routeId: "r1",
	receivedAt: new Date(0).toISOString(),
	envelope: {
		mailFrom: "x@y.com",
		rcptTo: ["a@b.com"],
		remoteAddress: "10.0.0.1",
		tls: false,
	},
	authentication: { spf: "pass", dkim: "pass" },
	message: {
		messageId: "m1",
		from: { address: "x@y.com" },
		to: [{ address: "a@b.com" }],
		cc: [],
		subject: "hi",
		date: new Date(0).toISOString(),
		references: [],
	},
	attachments: [],
};

const noSleep = async () => undefined;

describe("HMAC signing", () => {
	it("signs and verifies", () => {
		const { timestamp, signature } = signPayload("secret", "body");
		expect(verifySignature("secret", timestamp, "body", signature)).toBe(true);
	});
	it("rejects invalid signature", () => {
		expect(verifySignature("secret", "1", "body", "00")).toBe(false);
	});
	it("computes deterministic signature", () => {
		expect(computeSignature("k", "1", "b")).toBe(
			computeSignature("k", "1", "b"),
		);
	});
});

describe("deliverWebhook", () => {
	it("delivers on first 2xx", async () => {
		let calls = 0;
		const fetcher: WebhookFetcher = async () => {
			calls += 1;
			return { status: 200, body: "ok" } satisfies HttpResponseLike;
		};
		const report = await deliverWebhook(route, payload, {
			fetcher,
			sleep: noSleep,
		});
		expect(report.delivered).toBe(true);
		expect(report.deadLettered).toBe(false);
		expect(calls).toBe(1);
	});

	it("retries on 5xx then succeeds", async () => {
		let calls = 0;
		const fetcher: WebhookFetcher = async () => {
			calls += 1;
			if (calls < 3) return { status: 503, body: "down" };
			return { status: 200, body: "ok" };
		};
		const report = await deliverWebhook(route, payload, {
			fetcher,
			sleep: noSleep,
			maxAttempts: 5,
			initialBackoffMs: 1,
		});
		expect(report.delivered).toBe(true);
		expect(report.attempts.length).toBe(3);
	});

	it("dead-letters on 4xx (non-retryable)", async () => {
		const fetcher: WebhookFetcher = async () => ({ status: 400, body: "bad" });
		const report = await deliverWebhook(route, payload, {
			fetcher,
			sleep: noSleep,
		});
		expect(report.delivered).toBe(false);
		expect(report.deadLettered).toBe(true);
		expect(report.attempts.length).toBe(1);
	});

	it("dead-letters after max attempts on persistent 5xx", async () => {
		const fetcher: WebhookFetcher = async () => ({ status: 503, body: "down" });
		const report = await deliverWebhook(route, payload, {
			fetcher,
			sleep: noSleep,
			maxAttempts: 3,
			initialBackoffMs: 1,
		});
		expect(report.delivered).toBe(false);
		expect(report.deadLettered).toBe(true);
		expect(report.attempts.length).toBe(3);
	});

	it("retries on network error", async () => {
		let calls = 0;
		const fetcher: WebhookFetcher = async () => {
			calls += 1;
			if (calls < 2) throw new Error("ECONNRESET");
			return { status: 200, body: "ok" };
		};
		const report = await deliverWebhook(route, payload, {
			fetcher,
			sleep: noSleep,
			maxAttempts: 3,
			initialBackoffMs: 1,
		});
		expect(report.delivered).toBe(true);
		expect(report.attempts[0]?.status).toBe("network_error");
	});

	it("respects maxTotalMs ceiling", async () => {
		const fetcher: WebhookFetcher = async () => ({ status: 503, body: "" });
		let nowVal = 0;
		const now = () => nowVal;
		const sleep = async (ms: number) => {
			nowVal += ms;
		};
		const report = await deliverWebhook(route, payload, {
			fetcher,
			sleep,
			now,
			maxAttempts: 100,
			initialBackoffMs: 1000,
			maxBackoffMs: 1000,
			maxTotalMs: 5000,
		});
		expect(report.deadLettered).toBe(true);
		expect(report.totalElapsedMs).toBeLessThanOrEqual(10_000);
	});

	it("sends HMAC headers on each request", async () => {
		const captured: Array<Record<string, string>> = [];
		const fetcher: WebhookFetcher = async (_url, init) => {
			captured.push(init.headers);
			return { status: 200, body: "ok" };
		};
		await deliverWebhook(route, payload, { fetcher, sleep: noSleep });
		expect(captured[0]?.["x-crontech-signature"]?.length).toBeGreaterThan(0);
		expect(captured[0]?.["x-crontech-timestamp"]?.length).toBeGreaterThan(0);
	});
});

describe("computeBackoff", () => {
	it("grows exponentially up to max", () => {
		const a = computeBackoff(1, 1000, 60_000);
		const b = computeBackoff(5, 1000, 60_000);
		expect(b).toBeGreaterThan(a);
		const huge = computeBackoff(20, 1000, 30_000);
		expect(huge).toBeLessThanOrEqual(30_000 * 1.2 + 1);
	});
});
