import { describe, expect, test } from "bun:test";
import { signDkim, generateDkimKeyPair } from "../src/crypto/dkim.ts";
import { StaticDnsResolver } from "../src/dns/resolver.ts";
import { dkimDnsRecordToPem, verifyMessage } from "../src/verifier.ts";

describe("verifier", () => {
	test("dkimDnsRecordToPem produces valid PEM", () => {
		const der = "AAAAAAAA";
		const pem = dkimDnsRecordToPem(`v=DKIM1; k=rsa; p=${der}`);
		expect(pem).toContain("BEGIN PUBLIC KEY");
		expect(pem).toContain("AAAAAAAA");
	});

	test("end-to-end SPF + DKIM + DMARC pass", async () => {
		const kp = generateDkimKeyPair(2048);
		const resolver = new StaticDnsResolver();
		resolver.set("acme.test", [["v=spf1 ip4:192.0.2.0/24 -all"]]);
		const der = kp.publicKeyPem
			.replace(/-----BEGIN PUBLIC KEY-----/g, "")
			.replace(/-----END PUBLIC KEY-----/g, "")
			.replace(/\s+/g, "");
		resolver.set("s1._domainkey.acme.test", [[`v=DKIM1; k=rsa; p=${der}`]]);
		resolver.set("_dmarc.acme.test", [["v=DMARC1; p=reject; aspf=r; adkim=r"]]);

		const headers = {
			From: "alice@acme.test",
			To: "bob@x.test",
			Subject: "Hi",
			Date: "Mon, 01 Jan 2026 00:00:00 +0000",
		};
		const body = "Hello DMARC\r\n";
		const sig = signDkim({
			domain: "acme.test",
			selector: "s1",
			privateKeyPem: kp.privateKeyPem,
			headers,
			body,
		});
		const sigValue = sig.replace(/^DKIM-Signature:\s*/, "");

		const result = await verifyMessage({
			senderDomain: "acme.test",
			senderIp: "192.0.2.5",
			headerFromDomain: "acme.test",
			headers: { ...headers, "DKIM-Signature": sigValue },
			body,
			resolver,
		});
		expect(result.spf).toBe("pass");
		expect(result.dkim).toBe("pass");
		expect(result.dmarc).toBe("pass");
		expect(result.alignment.dkim).toBe(true);
	});

	test("DKIM none when no signature header", async () => {
		const resolver = new StaticDnsResolver();
		resolver.set("acme.test", [["v=spf1 -all"]]);
		const result = await verifyMessage({
			senderDomain: "acme.test",
			senderIp: "1.1.1.1",
			headerFromDomain: "acme.test",
			headers: { From: "a@acme.test" },
			body: "x",
			resolver,
		});
		expect(result.dkim).toBe("none");
	});
});
