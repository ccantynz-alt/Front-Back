import { describe, expect, it } from "bun:test";
import { prefilter } from "../src/spam/prefilter.ts";
import type { ParsedMessage } from "../src/types/index.ts";

function build(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
	return {
		messageId: "m1",
		from: { address: "x@y.com" },
		to: [{ address: "a@b.com" }],
		cc: [],
		subject: "hello",
		date: new Date(),
		references: [],
		textBody: "hi",
		attachments: [],
		headers: [],
		rawSize: 100,
		...overrides,
	};
}

describe("spam prefilter", () => {
	it("flags clean message as not spam", () => {
		const r = prefilter(build());
		expect(r.isSpam).toBe(false);
	});

	it("flags spam keywords", () => {
		const r = prefilter(
			build({
				subject: "viagra cialis act now",
				textBody: "viagra cialis nigerian prince",
			}),
		);
		expect(r.isSpam).toBe(true);
		expect(r.score).toBeGreaterThan(0);
	});

	it("flags suspicious TLDs", () => {
		const r = prefilter(
			build({
				from: { address: "scammer@bad.zip" },
				subject: "viagra act now",
			}),
		);
		expect(r.isSpam).toBe(true);
	});

	it("flags empty body + empty subject combined", () => {
		const base = build({ subject: "" });
		const { textBody: _omit, ...rest } = base;
		const r = prefilter(rest as unknown as ParsedMessage);
		expect(r.signals.length).toBeGreaterThan(0);
	});
});
