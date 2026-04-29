import { describe, expect, test } from "bun:test";
import { domainsAlign, evaluateDmarc, parseDmarcRecord } from "../src/auth/dmarc.ts";
import { StaticDnsResolver } from "../src/dns/resolver.ts";

describe("dmarc", () => {
	test("parses minimal record", () => {
		const r = parseDmarcRecord("v=DMARC1; p=quarantine; rua=mailto:r@acme.test");
		expect(r.p).toBe("quarantine");
		expect(r.aspf).toBe("r");
		expect(r.adkim).toBe("r");
		expect(r.rua).toBe("mailto:r@acme.test");
	});

	test("parses strict alignment", () => {
		const r = parseDmarcRecord("v=DMARC1; p=reject; aspf=s; adkim=s");
		expect(r.aspf).toBe("s");
		expect(r.adkim).toBe("s");
		expect(r.p).toBe("reject");
	});

	test("relaxed alignment matches subdomain", () => {
		expect(domainsAlign("mail.acme.test", "acme.test", false)).toBe(true);
		expect(domainsAlign("mail.acme.test", "acme.test", true)).toBe(false);
	});

	test("strict alignment requires exact match", () => {
		expect(domainsAlign("acme.test", "acme.test", true)).toBe(true);
		expect(domainsAlign("acme.test", "other.test", true)).toBe(false);
	});

	test("evaluateDmarc passes on aligned SPF", async () => {
		const r = new StaticDnsResolver();
		r.set("_dmarc.acme.test", [["v=DMARC1; p=reject; aspf=r; adkim=r"]]);
		const result = await evaluateDmarc({
			headerFromDomain: "acme.test",
			spfDomain: "mail.acme.test",
			dkimDomain: null,
			spfResult: "pass",
			dkimResult: "none",
			resolver: r,
		});
		expect(result.result).toBe("pass");
		expect(result.alignedSpf).toBe(true);
		expect(result.alignedDkim).toBe(false);
	});

	test("evaluateDmarc fails when no record published", async () => {
		const r = new StaticDnsResolver();
		const result = await evaluateDmarc({
			headerFromDomain: "acme.test",
			spfDomain: "acme.test",
			dkimDomain: null,
			spfResult: "pass",
			dkimResult: "none",
			resolver: r,
		});
		expect(result.result).toBe("fail");
		expect(result.policy).toBe("none");
	});

	test("strict aspf rejects subdomain alignment", async () => {
		const r = new StaticDnsResolver();
		r.set("_dmarc.acme.test", [["v=DMARC1; p=reject; aspf=s"]]);
		const result = await evaluateDmarc({
			headerFromDomain: "acme.test",
			spfDomain: "mail.acme.test",
			dkimDomain: null,
			spfResult: "pass",
			dkimResult: "none",
			resolver: r,
		});
		expect(result.alignedSpf).toBe(false);
		expect(result.result).toBe("fail");
	});
});
