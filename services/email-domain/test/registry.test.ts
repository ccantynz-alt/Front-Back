import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { StaticDnsResolver } from "../src/dns/resolver.ts";
import { DomainRegistry, lookupPublicKey } from "../src/registry.ts";
import { signDkim, verifyDkim } from "../src/crypto/dkim.ts";

function freshRegistry(opts: { now?: () => number; graceMs?: number } = {}) {
	const resolver = new StaticDnsResolver();
	const initOpts: ConstructorParameters<typeof DomainRegistry>[0] = {
		kek: randomBytes(32),
		resolver,
	};
	if (opts.now) Object.assign(initOpts, { now: opts.now });
	if (opts.graceMs !== undefined) Object.assign(initOpts, { dkimGraceMs: opts.graceMs });
	const registry = new DomainRegistry(initOpts);
	return { registry, resolver };
}

describe("registry / domain lifecycle", () => {
	test("addDomain returns DNS records and pending status", async () => {
		const { registry } = freshRegistry();
		const result = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		expect(result.domain.status).toBe("pending");
		expect(result.dnsRecords.length).toBe(3);
		const purposes = result.dnsRecords.map((r) => r.purpose).sort();
		expect(purposes).toEqual(["dkim", "dmarc", "spf"]);
	});

	test("verify transitions to verified when DNS published", async () => {
		const { registry, resolver } = freshRegistry();
		const { domain, dnsRecords } = await registry.addDomain({
			tenantId: "t1",
			domain: "acme.test",
		});
		for (const rec of dnsRecords) {
			resolver.set(rec.host, [[rec.value]]);
		}
		const result = await registry.verify(domain.domainId);
		expect(result.status).toBe("verified");
		expect(result.checks.spf).toBe(true);
		expect(result.checks.dkim).toBe(true);
		expect(result.checks.dmarc).toBe(true);
	});

	test("verify fails with errors when records missing", async () => {
		const { registry } = freshRegistry();
		const { domain } = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		const result = await registry.verify(domain.domainId);
		expect(result.status).toBe("failed");
		expect(result.errors.length).toBe(3);
	});

	test("loadActivePrivateKey rejects cross-tenant access", async () => {
		const { registry } = freshRegistry();
		const { domain } = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		expect(() =>
			registry.loadActivePrivateKey({ domainId: domain.domainId, tenantId: "t2" }),
		).toThrow();
	});

	test("loaded private key signs and verifies via active public key", async () => {
		const { registry } = freshRegistry();
		const { domain } = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		const privateKeyPem = registry.loadActivePrivateKey({
			domainId: domain.domainId,
			tenantId: "t1",
		});
		const headers = {
			From: "a@acme.test",
			To: "b@x.test",
			Subject: "S",
			Date: "Mon, 01 Jan 2026 00:00:00 +0000",
		};
		const sig = signDkim({
			domain: domain.domain,
			selector: domain.dkimActive.selector,
			privateKeyPem,
			headers,
			body: "hello\r\n",
		});
		const headerValue = sig.replace(/^DKIM-Signature:\s*/, "");
		const ok = verifyDkim({
			dkimSignatureHeader: headerValue,
			headers,
			body: "hello\r\n",
			publicKey: domain.dkimActive.publicKeyPem,
		});
		expect(ok).toBe(true);
	});

	test("rotateDkim issues new key, retains old in grace window", async () => {
		let now = 1_000_000_000_000;
		const grace = 1_000;
		const { registry } = freshRegistry({ now: () => now, graceMs: grace });
		const { domain } = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		const oldSelector = domain.dkimActive.selector;

		now += 1; // ensure new selector differs
		const rotation = await registry.rotateDkim(domain.domainId);
		expect(rotation.domain.dkimActive.selector).not.toBe(oldSelector);
		expect(rotation.domain.dkimRetired.length).toBe(1);
		expect(rotation.domain.dkimRetired[0]?.selector).toBe(oldSelector);
		expect(rotation.domain.status).toBe("pending");

		// Within grace, lookupPublicKey still returns the retired key.
		const stillFound = lookupPublicKey(registry, domain.domain, oldSelector);
		expect(stillFound).not.toBeNull();

		// After grace expiry, a second rotation purges.
		now += grace + 5;
		await registry.rotateDkim(domain.domainId);
		const purged = lookupPublicKey(registry, domain.domain, oldSelector);
		expect(purged).toBeNull();
	});

	test("getByDomain returns the right tenant's record", async () => {
		const { registry } = freshRegistry();
		await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		await registry.addDomain({ tenantId: "t2", domain: "acme.test" });
		const a = registry.getByDomain("acme.test", "t1");
		const b = registry.getByDomain("acme.test", "t2");
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(a?.tenantId).toBe("t1");
		expect(b?.tenantId).toBe("t2");
		expect(a?.domainId).not.toBe(b?.domainId);
	});
});
