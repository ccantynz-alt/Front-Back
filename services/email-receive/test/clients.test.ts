import { describe, expect, it } from "bun:test";
import { MockEmailDomainClient } from "../src/clients/email-domain.ts";

describe("MockEmailDomainClient", () => {
	it("returns configured SPF/DKIM defaults", async () => {
		const c = new MockEmailDomainClient({ spf: "pass", dkim: "fail" });
		expect(
			await c.checkSpf({
				mailFrom: "a@b.com",
				remoteAddress: "10.0.0.1",
				heloName: "h",
			}),
		).toBe("pass");
		expect(await c.checkDkim({ rawMessage: "x" })).toBe("fail");
	});

	it("defaults to neutral", async () => {
		const c = new MockEmailDomainClient();
		expect(
			await c.checkSpf({
				mailFrom: "a@b.com",
				remoteAddress: "10.0.0.1",
				heloName: "h",
			}),
		).toBe("neutral");
		expect(await c.checkDkim({ rawMessage: "x" })).toBe("neutral");
	});
});
