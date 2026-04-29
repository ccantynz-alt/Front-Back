/**
 * RFC 7489 §7.2 DMARC aggregate report parser. Reports arrive either as
 * raw XML or gzipped XML. We tolerate both, plus minor schema drift seen in
 * the wild (Google, Microsoft, Yahoo, Mail.ru).
 *
 * The parser is hand-rolled — a real XML parser would be overkill for the
 * fixed grammar of aggregate reports, and pulling in a heavyweight
 * dependency would bloat the edge-deployable bundle.
 */

import { gunzipSync } from "node:zlib";
import type { DmarcReport, DmarcReportRecord } from "./types.ts";

export function parseDmarcReport(input: Buffer | string): DmarcReport {
	const xml = decodeIfGzip(input);

	const orgName = pickText(xml, "org_name") ?? "";
	const reportId = pickText(xml, "report_id") ?? "";
	const begin = Number(pickText(xml, "begin") ?? "0");
	const end = Number(pickText(xml, "end") ?? "0");
	const policyDomain = pickText(xml, "domain") ?? "";

	const records: DmarcReportRecord[] = [];
	for (const block of iterateBlocks(xml, "record")) {
		const sourceIp = pickText(block, "source_ip") ?? "";
		const count = Number(pickText(block, "count") ?? "0");
		const dispRaw = pickText(block, "disposition") ?? "none";
		const disposition: DmarcReportRecord["disposition"] =
			dispRaw === "reject" || dispRaw === "quarantine" ? dispRaw : "none";
		const dkim = (pickText(block, "dkim") ?? "fail") === "pass" ? "pass" : "fail";
		const spf = (pickText(block, "spf") ?? "fail") === "pass" ? "pass" : "fail";
		const headerFrom = pickText(block, "header_from") ?? "";
		records.push({ sourceIp, count, disposition, dkim, spf, headerFrom });
	}

	return {
		orgName,
		reportId,
		dateRangeBegin: begin,
		dateRangeEnd: end,
		policyDomain,
		records,
	};
}

function decodeIfGzip(input: Buffer | string): string {
	if (typeof input === "string") return input;
	if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) {
		return gunzipSync(input).toString("utf8");
	}
	return input.toString("utf8");
}

function pickText(xml: string, tag: string): string | null {
	const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
	const m = xml.match(re);
	if (!m || m[1] === undefined) return null;
	return m[1].trim();
}

function* iterateBlocks(xml: string, tag: string): Generator<string> {
	const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
	let m: RegExpExecArray | null = re.exec(xml);
	while (m !== null) {
		const captured = m[1];
		if (captured !== undefined) {
			yield captured;
		}
		m = re.exec(xml);
	}
}
