import { describe, expect, it } from "bun:test";
import { matchRoute, patternMatches } from "../src/routes/match.ts";
import { InMemoryInboundRouteRegistry } from "../src/registry/inbound-routes.ts";

describe("patternMatches", () => {
	it("matches exact addresses", () => {
		expect(patternMatches("a@b.com", "a@b.com")).toBe(true);
		expect(patternMatches("a@b.com", "x@b.com")).toBe(false);
	});
	it("matches case-insensitively", () => {
		expect(patternMatches("A@B.COM", "a@b.com")).toBe(true);
	});
	it("matches wildcard local part", () => {
		expect(patternMatches("*@acme.com", "support@acme.com")).toBe(true);
		expect(patternMatches("*@acme.com", "support@bad.com")).toBe(false);
	});
	it("matches wildcard domain", () => {
		expect(patternMatches("support@*.crontech.dev", "support@acme.crontech.dev")).toBe(true);
		expect(patternMatches("support@*.crontech.dev", "sales@acme.crontech.dev")).toBe(false);
	});
	it("matches catch-all", () => {
		expect(patternMatches("*", "anything@anywhere.io")).toBe(true);
	});
});

describe("matchRoute specificity", () => {
	const registry = new InMemoryInboundRouteRegistry();
	const exact = registry.create({
		tenantId: "t1",
		pattern: "support@acme.crontech.dev",
		webhookUrl: "https://hooks.acme.com/exact",
		hmacSecret: "verysecretkey1234",
		enabled: true,
	});
	const localWild = registry.create({
		tenantId: "t1",
		pattern: "*@acme.crontech.dev",
		webhookUrl: "https://hooks.acme.com/local",
		hmacSecret: "verysecretkey1234",
		enabled: true,
	});
	const domainWild = registry.create({
		tenantId: "t1",
		pattern: "support@*.crontech.dev",
		webhookUrl: "https://hooks.acme.com/dom",
		hmacSecret: "verysecretkey1234",
		enabled: true,
	});
	registry.create({
		tenantId: "t1",
		pattern: "*",
		webhookUrl: "https://hooks.acme.com/catch",
		hmacSecret: "verysecretkey1234",
		enabled: true,
	});

	it("prefers exact match over wildcards", () => {
		const m = matchRoute(registry.listAll(), "t1", "support@acme.crontech.dev");
		expect(m?.id).toBe(exact.id);
	});
	it("prefers local-wildcard over domain-wildcard for non-support local", () => {
		const m = matchRoute(registry.listAll(), "t1", "billing@acme.crontech.dev");
		expect(m?.id).toBe(localWild.id);
	});
	it("falls back to domain-wildcard when local doesn't match", () => {
		const m = matchRoute(registry.listAll(), "t1", "support@beta.crontech.dev");
		expect(m?.id).toBe(domainWild.id);
	});
	it("respects tenant boundaries", () => {
		const m = matchRoute(registry.listAll(), "t2", "support@acme.crontech.dev");
		expect(m).toBeNull();
	});
	it("ignores disabled routes", () => {
		const reg = new InMemoryInboundRouteRegistry();
		const r = reg.create({
			tenantId: "t1",
			pattern: "a@b.com",
			webhookUrl: "https://h",
			hmacSecret: "verysecretkey1234",
			enabled: false,
		});
		expect(matchRoute([r], "t1", "a@b.com")).toBeNull();
	});
});
