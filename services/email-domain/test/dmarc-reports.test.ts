import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { parseDmarcReport } from "../src/dmarc-reports.ts";

const SAMPLE = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <report_id>1234567890</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>acme.test</domain>
    <p>quarantine</p>
  </policy_published>
  <record>
    <row>
      <source_ip>192.0.2.1</source_ip>
      <count>5</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers><header_from>acme.test</header_from></identifiers>
  </record>
  <record>
    <row>
      <source_ip>198.51.100.7</source_ip>
      <count>2</count>
      <policy_evaluated>
        <disposition>quarantine</disposition>
        <dkim>fail</dkim>
        <spf>fail</spf>
      </policy_evaluated>
    </row>
    <identifiers><header_from>acme.test</header_from></identifiers>
  </record>
</feedback>`;

describe("dmarc-reports", () => {
	test("parses raw XML aggregate report", () => {
		const r = parseDmarcReport(SAMPLE);
		expect(r.orgName).toBe("google.com");
		expect(r.reportId).toBe("1234567890");
		expect(r.policyDomain).toBe("acme.test");
		expect(r.dateRangeBegin).toBe(1700000000);
		expect(r.dateRangeEnd).toBe(1700086400);
		expect(r.records.length).toBe(2);
		const first = r.records[0];
		expect(first?.sourceIp).toBe("192.0.2.1");
		expect(first?.count).toBe(5);
		expect(first?.dkim).toBe("pass");
		expect(first?.spf).toBe("pass");
		expect(first?.disposition).toBe("none");
		const second = r.records[1];
		expect(second?.disposition).toBe("quarantine");
		expect(second?.dkim).toBe("fail");
	});

	test("parses gzipped XML report", () => {
		const gz = gzipSync(Buffer.from(SAMPLE, "utf8"));
		const r = parseDmarcReport(gz);
		expect(r.records.length).toBe(2);
		expect(r.records[0]?.sourceIp).toBe("192.0.2.1");
	});

	test("zero-record report is tolerated", () => {
		const xml = `<feedback><report_metadata><org_name>x</org_name></report_metadata></feedback>`;
		const r = parseDmarcReport(xml);
		expect(r.records.length).toBe(0);
	});
});
