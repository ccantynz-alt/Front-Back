import { describe, expect, it } from "bun:test";
import { MockEmailDomainClient } from "../src/clients/email-domain.ts";
import { InMemoryInboundEventStore } from "../src/log/event-store.ts";
import { InboundPipeline } from "../src/pipeline/index.ts";
import { InMemoryInboundRouteRegistry } from "../src/registry/inbound-routes.ts";
import type {
	HttpResponseLike,
	WebhookFetcher,
} from "../src/delivery/webhook.ts";
import type { SmtpEnvelope } from "../src/types/index.ts";

function buildEnvelope(rcpt: string): SmtpEnvelope {
	return {
		remoteAddress: "10.0.0.1",
		heloName: "client.example.com",
		mailFrom: "sender@example.com",
		rcptTo: [rcpt],
		receivedAt: new Date(),
		tls: false,
	};
}

function buildRaw(subject: string, body = "hello body"): string {
	return [
		"Message-ID: <pipe-test@example.com>",
		"From: sender@example.com",
		"To: rcpt@acme.crontech.dev",
		`Subject: ${subject}`,
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
	].join("\r\n");
}

describe("InboundPipeline", () => {
	it("delivers an inbound message to the matched route", async () => {
		const registry = new InMemoryInboundRouteRegistry();
		registry.create({
			tenantId: "acme",
			pattern: "*@acme.crontech.dev",
			webhookUrl: "https://hooks.acme.com/inbound",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const events = new InMemoryInboundEventStore();
		const captured: Array<HttpResponseLike & { body?: string }> = [];
		const fetcher: WebhookFetcher = async (_u, init) => {
			captured.push({ status: 200, body: init.body });
			return { status: 200, body: "ok" };
		};
		const pipeline = new InboundPipeline({
			tenantResolver: () => "acme",
			registry,
			events,
			emailDomain: new MockEmailDomainClient({ spf: "pass", dkim: "pass" }),
			delivery: { fetcher, sleep: async () => undefined },
		});
		const outcome = await pipeline.process(
			buildEnvelope("rcpt@acme.crontech.dev"),
			buildRaw("hello"),
		);
		expect(outcome.accepted).toBe(true);
		expect(outcome.status).toBe("delivered");
		expect(captured.length).toBe(1);
		const stored = events.listByTenant("acme");
		expect(stored[0]?.deliveryStatus).toBe("delivered");
		expect(stored[0]?.spfPass).toBe(true);
		expect(stored[0]?.dkimPass).toBe(true);
	});

	it("rejects messages with no matching route", async () => {
		const registry = new InMemoryInboundRouteRegistry();
		const events = new InMemoryInboundEventStore();
		const pipeline = new InboundPipeline({
			tenantResolver: () => "acme",
			registry,
			events,
			emailDomain: new MockEmailDomainClient(),
		});
		const outcome = await pipeline.process(
			buildEnvelope("nothere@acme.crontech.dev"),
			buildRaw("x"),
		);
		expect(outcome.status).toBe("no_route");
		expect(outcome.accepted).toBe(false);
	});

	it("rejects messages with no tenant resolution", async () => {
		const registry = new InMemoryInboundRouteRegistry();
		const events = new InMemoryInboundEventStore();
		const pipeline = new InboundPipeline({
			tenantResolver: () => null,
			registry,
			events,
			emailDomain: new MockEmailDomainClient(),
		});
		const outcome = await pipeline.process(
			buildEnvelope("rcpt@unowned.com"),
			buildRaw("x"),
		);
		expect(outcome.status).toBe("no_route");
	});

	it("flags spam messages and skips webhook delivery", async () => {
		const registry = new InMemoryInboundRouteRegistry();
		registry.create({
			tenantId: "acme",
			pattern: "*",
			webhookUrl: "https://hooks.acme.com/inbound",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const events = new InMemoryInboundEventStore();
		let calls = 0;
		const fetcher: WebhookFetcher = async () => {
			calls += 1;
			return { status: 200, body: "ok" };
		};
		const pipeline = new InboundPipeline({
			tenantResolver: () => "acme",
			registry,
			events,
			emailDomain: new MockEmailDomainClient(),
			delivery: { fetcher, sleep: async () => undefined },
		});
		// Build a spammy raw message: keywords in subject + suspicious TLD sender.
		const raw = [
			"Message-ID: <spam@x.zip>",
			"From: scammer@bad.zip",
			"To: rcpt@acme.crontech.dev",
			"Subject: viagra cialis act now limited time offer",
			"Content-Type: text/plain; charset=utf-8",
			"",
			"viagra cialis nigerian prince",
		].join("\r\n");
		const outcome = await pipeline.process(
			buildEnvelope("rcpt@acme.crontech.dev"),
			raw,
		);
		expect(outcome.status).toBe("rejected_spam");
		expect(calls).toBe(0);
	});

	it("invokes attachment classifier hook", async () => {
		const registry = new InMemoryInboundRouteRegistry();
		registry.create({
			tenantId: "acme",
			pattern: "*",
			webhookUrl: "https://hooks.acme.com/inbound",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const events = new InMemoryInboundEventStore();
		let classifierCalls = 0;
		const fetcher: WebhookFetcher = async () => ({ status: 200, body: "ok" });
		const pipeline = new InboundPipeline({
			tenantResolver: () => "acme",
			registry,
			events,
			emailDomain: new MockEmailDomainClient(),
			delivery: { fetcher, sleep: async () => undefined },
			classifyAttachments: async () => {
				classifierCalls += 1;
			},
		});
		await pipeline.process(
			buildEnvelope("rcpt@acme.crontech.dev"),
			buildRaw("normal subject"),
		);
		expect(classifierCalls).toBe(1);
	});

	it("records dead-lettered status when webhook fails persistently", async () => {
		const registry = new InMemoryInboundRouteRegistry();
		registry.create({
			tenantId: "acme",
			pattern: "*",
			webhookUrl: "https://hooks.acme.com/inbound",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const events = new InMemoryInboundEventStore();
		const fetcher: WebhookFetcher = async () => ({ status: 503, body: "" });
		const pipeline = new InboundPipeline({
			tenantResolver: () => "acme",
			registry,
			events,
			emailDomain: new MockEmailDomainClient(),
			delivery: {
				fetcher,
				sleep: async () => undefined,
				maxAttempts: 2,
				initialBackoffMs: 1,
			},
		});
		const outcome = await pipeline.process(
			buildEnvelope("rcpt@acme.crontech.dev"),
			buildRaw("normal"),
		);
		expect(outcome.status).toBe("dead_lettered");
		const stored = events.listByTenant("acme");
		expect(stored[0]?.deliveryStatus).toBe("dead_lettered");
	});
});
