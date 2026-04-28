import { describe, expect, it } from "bun:test";
import {
	bytesToString,
	decodeBase64,
	decodeEncodedWord,
	decodeQuotedPrintable,
} from "../src/parser/decode.ts";

describe("base64 decoder", () => {
	it("decodes simple base64", () => {
		const bytes = decodeBase64("SGVsbG8sIHdvcmxkIQ==");
		expect(new TextDecoder().decode(bytes)).toBe("Hello, world!");
	});
	it("strips embedded whitespace and CRLF", () => {
		const bytes = decodeBase64("SGVs\r\nbG8s\nIHdvcmxkIQ==");
		expect(new TextDecoder().decode(bytes)).toBe("Hello, world!");
	});
	it("returns empty Uint8Array on empty input", () => {
		expect(decodeBase64("").length).toBe(0);
	});
});

describe("quoted-printable decoder", () => {
	it("decodes hex escapes", () => {
		const bytes = decodeQuotedPrintable("Hello=20World=21");
		expect(new TextDecoder().decode(bytes)).toBe("Hello World!");
	});
	it("handles soft line breaks", () => {
		const bytes = decodeQuotedPrintable("Hello=\r\nWorld");
		expect(new TextDecoder().decode(bytes)).toBe("HelloWorld");
	});
	it("handles latin-1 bytes", () => {
		const bytes = decodeQuotedPrintable("=A1Hola");
		expect(bytesToString(bytes, "iso-8859-1")).toBe("¡Hola");
	});
	it("emits literal = on malformed escape", () => {
		const bytes = decodeQuotedPrintable("=ZZ");
		expect(new TextDecoder().decode(bytes)).toBe("=ZZ");
	});
});

describe("RFC 2047 encoded-word decoder", () => {
	it("decodes B-encoding (base64)", () => {
		expect(decodeEncodedWord("=?utf-8?B?SGVsbG8=?=")).toBe("Hello");
	});
	it("decodes Q-encoding with underscores", () => {
		expect(decodeEncodedWord("=?utf-8?Q?Hello_World?=")).toBe("Hello World");
	});
	it("decodes mixed text and encoded-word", () => {
		expect(decodeEncodedWord("Re: =?utf-8?B?SGVsbG8=?= world")).toBe(
			"Re: Hello world",
		);
	});
	it("joins adjacent encoded-words without intervening whitespace", () => {
		const out = decodeEncodedWord("=?utf-8?B?SGVsbG8=?= =?utf-8?B?V29ybGQ=?=");
		expect(out).toBe("HelloWorld");
	});
	it("decodes iso-8859-1 Q-encoding", () => {
		const out = decodeEncodedWord("=?iso-8859-1?Q?=A1Hola?=");
		expect(out).toBe("¡Hola");
	});
});
