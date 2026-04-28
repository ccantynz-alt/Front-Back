import { describe, expect, it } from "bun:test";
import { Allowlist } from "../src/allowlist.ts";
import { OptimizerError } from "../src/types.ts";

describe("Allowlist", () => {
	const config = {
		tenants: {
			acme: ["cdn.acme.com", "*.acme-static.com"],
			widgetco: ["images.widgetco.io:8443"],
		},
		defaultTenant: "acme",
	};

	it("allows exact host match", () => {
		const al = new Allowlist(config);
		expect(() =>
			al.assertAllowed("https://cdn.acme.com/a.png", "acme"),
		).not.toThrow();
	});

	it("allows wildcard subdomain match", () => {
		const al = new Allowlist(config);
		expect(() =>
			al.assertAllowed("https://a.acme-static.com/x.png", "acme"),
		).not.toThrow();
		expect(() =>
			al.assertAllowed("https://a.b.acme-static.com/x.png", "acme"),
		).not.toThrow();
	});

	it("rejects bare apex when only wildcard is allowed", () => {
		const al = new Allowlist(config);
		expect(() =>
			al.assertAllowed("https://acme-static.com/x.png", "acme"),
		).toThrow(OptimizerError);
	});

	it("rejects host outside tenant's allowlist", () => {
		const al = new Allowlist(config);
		expect(() =>
			al.assertAllowed("https://evil.com/a.png", "acme"),
		).toThrow(OptimizerError);
	});

	it("rejects when tenant has no entries", () => {
		const al = new Allowlist({ tenants: { acme: [] } });
		expect(() =>
			al.assertAllowed("https://cdn.acme.com/a.png", "acme"),
		).toThrow(OptimizerError);
	});

	it("rejects when tenant id is unknown", () => {
		const al = new Allowlist(config);
		expect(() =>
			al.assertAllowed("https://cdn.acme.com/a.png", "ghost-tenant"),
		).toThrow(OptimizerError);
	});

	it("uses default tenant when tenantId is not supplied", () => {
		const al = new Allowlist(config);
		expect(() =>
			al.assertAllowed("https://cdn.acme.com/a.png"),
		).not.toThrow();
	});

	it("rejects when no tenant id and no default tenant", () => {
		const al = new Allowlist({ tenants: { acme: ["cdn.acme.com"] } });
		expect(() =>
			al.assertAllowed("https://cdn.acme.com/a.png"),
		).toThrow(OptimizerError);
	});

	it("enforces port match when pattern has a port", () => {
		const al = new Allowlist(config);
		// pattern is :8443 (non-default), so the implicit-port URL is rejected
		expect(() =>
			al.assertAllowed("https://images.widgetco.io/x.png", "widgetco"),
		).toThrow(OptimizerError);
		expect(() =>
			al.assertAllowed("https://images.widgetco.io:8443/x.png", "widgetco"),
		).not.toThrow();
	});

	it("rejects malformed src URLs", () => {
		const al = new Allowlist(config);
		expect(() => al.assertAllowed("not-a-url", "acme")).toThrow(OptimizerError);
	});
});
