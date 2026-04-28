import { describe, expect, test } from "bun:test";
import { cidrMatch, evaluateSpf } from "../src/auth/spf.ts";
import { StaticDnsResolver } from "../src/dns/resolver.ts";

describe("spf", () => {
	test("ip4 mechanism with /24 mask", () => {
		expect(cidrMatch("192.0.2.5", "192.0.2.0/24")).toBe(true);
		expect(cidrMatch("192.0.3.5", "192.0.2.0/24")).toBe(false);
		expect(cidrMatch("0.0.0.0", "0.0.0.0/0")).toBe(true);
	});

	test("ip4 exact match", () => {
		expect(cidrMatch("10.1.1.1", "10.1.1.1")).toBe(true);
		expect(cidrMatch("10.1.1.2", "10.1.1.1")).toBe(false);
	});

	test("ip6 prefix match", () => {
		expect(cidrMatch("2001:db8::1", "2001:db8::/32")).toBe(true);
		expect(cidrMatch("2001:db9::1", "2001:db8::/32")).toBe(false);
	});

	test("evaluates pass on ip4 match", async () => {
		const r = new StaticDnsResolver();
		r.set("acme.test", [["v=spf1 ip4:192.0.2.0/24 -all"]]);
		const result = await evaluateSpf({
			senderDomain: "acme.test",
			senderIp: "192.0.2.10",
			resolver: r,
		});
		expect(result).toBe("pass");
	});

	test("evaluates fail when -all matches", async () => {
		const r = new StaticDnsResolver();
		r.set("acme.test", [["v=spf1 ip4:10.0.0.0/8 -all"]]);
		const result = await evaluateSpf({
			senderDomain: "acme.test",
			senderIp: "192.0.2.10",
			resolver: r,
		});
		expect(result).toBe("fail");
	});

	test("evaluates softfail on ~all", async () => {
		const r = new StaticDnsResolver();
		r.set("acme.test", [["v=spf1 ~all"]]);
		const result = await evaluateSpf({
			senderDomain: "acme.test",
			senderIp: "1.2.3.4",
			resolver: r,
		});
		expect(result).toBe("softfail");
	});

	test("include mechanism resolves to nested record", async () => {
		const r = new StaticDnsResolver();
		r.set("acme.test", [["v=spf1 include:_spf.acme.test -all"]]);
		r.set("_spf.acme.test", [["v=spf1 ip4:192.0.2.0/24 -all"]]);
		const result = await evaluateSpf({
			senderDomain: "acme.test",
			senderIp: "192.0.2.5",
			resolver: r,
		});
		expect(result).toBe("pass");
	});

	test("returns none when no SPF record published", async () => {
		const r = new StaticDnsResolver();
		const result = await evaluateSpf({ senderDomain: "x.test", senderIp: "1.1.1.1", resolver: r });
		expect(result).toBe("none");
	});

	test("permerror on cyclic include", async () => {
		const r = new StaticDnsResolver();
		r.set("a.test", [["v=spf1 include:b.test -all"]]);
		r.set("b.test", [["v=spf1 include:a.test -all"]]);
		const result = await evaluateSpf({ senderDomain: "a.test", senderIp: "1.1.1.1", resolver: r });
		expect(result).toBe("permerror");
	});
});
