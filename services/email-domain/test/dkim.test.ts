import { describe, expect, test } from "bun:test";
import {
	canonicalizeBodyRelaxed,
	canonicalizeHeaderRelaxed,
	generateDkimKeyPair,
	parseDkimSignature,
	signDkim,
	verifyDkim,
} from "../src/crypto/dkim.ts";

describe("dkim", () => {
	test("generates 2048-bit RSA keypair with parseable PEM", () => {
		const kp = generateDkimKeyPair(2048);
		expect(kp.publicKeyPem).toContain("BEGIN PUBLIC KEY");
		expect(kp.privateKeyPem).toContain("BEGIN PRIVATE KEY");
		expect(kp.publicKeyDerB64.length).toBeGreaterThan(300);
	});

	test("relaxed body canonicalisation: collapses whitespace + trims trailing blanks", () => {
		const out = canonicalizeBodyRelaxed("Hello   world  \r\n\r\n\r\n");
		expect(out).toBe("Hello world\r\n");
	});

	test("relaxed body canonicalisation: empty body becomes empty string", () => {
		expect(canonicalizeBodyRelaxed("")).toBe("");
	});

	test("relaxed header canonicalisation: lowercases name, collapses whitespace", () => {
		const out = canonicalizeHeaderRelaxed("From", "  Alice <a@x>   ");
		expect(out).toBe("from:Alice <a@x>\r\n");
	});

	test("sign + verify round-trip succeeds", () => {
		const kp = generateDkimKeyPair(2048);
		const headers = {
			From: "alice@acme.test",
			To: "bob@example.test",
			Subject: "Hello",
			Date: "Mon, 01 Jan 2026 00:00:00 +0000",
		};
		const body = "This is the body of the message.\r\n";
		const sig = signDkim({
			domain: "acme.test",
			selector: "s2026",
			privateKeyPem: kp.privateKeyPem,
			headers,
			body,
			timestamp: 1735689600,
		});
		const headerValue = sig.replace(/^DKIM-Signature:\s*/, "");
		const ok = verifyDkim({
			dkimSignatureHeader: headerValue,
			headers,
			body,
			publicKey: kp.publicKeyPem,
		});
		expect(ok).toBe(true);
	});

	test("verify fails on tampered body", () => {
		const kp = generateDkimKeyPair(2048);
		const headers = {
			From: "alice@acme.test",
			To: "bob@example.test",
			Subject: "Hello",
			Date: "Mon, 01 Jan 2026 00:00:00 +0000",
		};
		const sig = signDkim({
			domain: "acme.test",
			selector: "s2026",
			privateKeyPem: kp.privateKeyPem,
			headers,
			body: "original",
		});
		const headerValue = sig.replace(/^DKIM-Signature:\s*/, "");
		const ok = verifyDkim({
			dkimSignatureHeader: headerValue,
			headers,
			body: "tampered",
			publicKey: kp.publicKeyPem,
		});
		expect(ok).toBe(false);
	});

	test("parseDkimSignature extracts tags", () => {
		const sigHeader =
			"v=1; a=rsa-sha256; c=relaxed/relaxed; d=acme.test; s=s1; t=1; h=from:to; bh=AAAA; b=BBBB";
		const parsed = parseDkimSignature(sigHeader);
		expect(parsed).not.toBeNull();
		expect(parsed?.tags["d"]).toBe("acme.test");
		expect(parsed?.signedHeaders).toEqual(["from", "to"]);
		expect(parsed?.bodyHash).toBe("AAAA");
		expect(parsed?.signatureB64).toBe("BBBB");
	});

	test("parseDkimSignature returns null on missing tags", () => {
		expect(parseDkimSignature("v=1")).toBeNull();
	});
});
