import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { StaticDnsResolver } from "../src/dns/resolver.ts";
import { DomainRegistry } from "../src/registry.ts";
import { createServer } from "../src/server.ts";
import { verifyDkim } from "../src/crypto/dkim.ts";

function makeServer() {
	const resolver = new StaticDnsResolver();
	const registry = new DomainRegistry({ kek: randomBytes(32), resolver });
	return { handler: createServer({ registry }), registry, resolver };
}

async function postJson(handler: (req: Request) => Promise<Response>, path: string, body: unknown) {
	return handler(
		new Request(`http://localhost${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("server", () => {
	test("POST /domains returns DNS records", async () => {
		const { handler } = makeServer();
		const res = await postJson(handler, "/domains", { tenantId: "t1", domain: "acme.test" });
		expect(res.status).toBe(201);
		const json = (await res.json()) as { dnsRecords: Array<{ purpose: string }> };
		expect(json.dnsRecords.length).toBe(3);
	});

	test("POST /sign returns a verifiable DKIM signature", async () => {
		const { handler, registry } = makeServer();
		const created = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		const res = await postJson(handler, "/sign", {
			tenantId: "t1",
			domainId: created.domain.domainId,
			headers: {
				From: "a@acme.test",
				To: "b@x.test",
				Subject: "Hi",
				Date: "Mon, 01 Jan 2026 00:00:00 +0000",
			},
			body: "Hello world\r\n",
		});
		expect(res.status).toBe(200);
		const { dkimSignature } = (await res.json()) as { dkimSignature: string };
		const headerValue = dkimSignature.replace(/^DKIM-Signature:\s*/, "");
		const ok = verifyDkim({
			dkimSignatureHeader: headerValue,
			headers: {
				From: "a@acme.test",
				To: "b@x.test",
				Subject: "Hi",
				Date: "Mon, 01 Jan 2026 00:00:00 +0000",
			},
			body: "Hello world\r\n",
			publicKey: created.domain.dkimActive.publicKeyPem,
		});
		expect(ok).toBe(true);
	});

	test("POST /sign rejects cross-tenant access", async () => {
		const { handler, registry } = makeServer();
		const created = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		const res = await postJson(handler, "/sign", {
			tenantId: "t2",
			domainId: created.domain.domainId,
			headers: { From: "a@acme.test", To: "b@x.test", Subject: "S", Date: "Mon" },
			body: "x",
		});
		expect(res.status).toBe(403);
	});

	test("POST /domains/:id/rotate-dkim issues new key", async () => {
		const { handler, registry } = makeServer();
		const created = await registry.addDomain({ tenantId: "t1", domain: "acme.test" });
		const oldSelector = created.domain.dkimActive.selector;
		// Sleep needed because selector encodes seconds — bump now via direct mutation isn't easy;
		// instead, accept that tests against time-based selectors may collide. We verify only that the
		// rotation endpoint succeeds and a DNS record is returned.
		const res = await postJson(handler, `/domains/${created.domain.domainId}/rotate-dkim`, {});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { dnsRecord: { purpose: string }; domain: { dkim: { activeSelector: string } } };
		expect(body.dnsRecord.purpose).toBe("dkim");
		// The selector field uses both timestamp and a uuid suffix, so it should differ.
		expect(body.domain.dkim.activeSelector).not.toBe(oldSelector);
	});

	test("POST /dmarc-reports stores parsed report", async () => {
		const { handler } = makeServer();
		const xml = `<feedback>
			<report_metadata><org_name>google.com</org_name><report_id>r1</report_id></report_metadata>
			<policy_published><domain>acme.test</domain></policy_published>
			<record><row><source_ip>1.2.3.4</source_ip><count>1</count>
				<policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
			</row><identifiers><header_from>acme.test</header_from></identifiers></record>
		</feedback>`;
		const res = await handler(
			new Request("http://localhost/dmarc-reports?tenantId=t1", {
				method: "POST",
				body: xml,
			}),
		);
		expect(res.status).toBe(202);
		const list = await handler(new Request("http://localhost/dmarc-reports?tenantId=t1"));
		const body = (await list.json()) as { reports: unknown[] };
		expect(body.reports.length).toBe(1);
	});

	test("404 on unknown route", async () => {
		const { handler } = makeServer();
		const res = await handler(new Request("http://localhost/nope"));
		expect(res.status).toBe(404);
	});
});
