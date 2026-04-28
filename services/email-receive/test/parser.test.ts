import { describe, expect, it } from "bun:test";
import { MessageTooLargeError, parseMessage } from "../src/parser/index.ts";
import { parseAddressList } from "../src/parser/addresses.ts";

const SIMPLE_PLAIN = [
	"Message-ID: <abc@example.com>",
	"From: Alice <alice@example.com>",
	"To: bob@example.org, carol@example.org",
	"Subject: Hello there",
	"Date: Mon, 1 Jan 2024 00:00:00 +0000",
	"Content-Type: text/plain; charset=utf-8",
	"",
	"Hello body",
].join("\r\n");

const ENCODED_SUBJECT = [
	"Message-ID: <enc@example.com>",
	"From: <q@example.com>",
	"To: r@example.com",
	"Subject: =?utf-8?B?SGVsbG8gV29ybGQ=?=",
	"Content-Type: text/plain; charset=utf-8",
	"",
	"body",
].join("\r\n");

const MULTIPART = [
	"Message-ID: <m@example.com>",
	"From: a@example.com",
	"To: b@example.com",
	"Subject: Multi",
	'Content-Type: multipart/mixed; boundary="BOUND"',
	"",
	"--BOUND",
	"Content-Type: text/plain; charset=utf-8",
	"",
	"plain text",
	"--BOUND",
	"Content-Type: text/html; charset=utf-8",
	"",
	"<p>html</p>",
	"--BOUND",
	"Content-Type: application/pdf",
	"Content-Disposition: attachment; filename=invoice.pdf",
	"Content-Transfer-Encoding: base64",
	"",
	"SGVsbG8sIHdvcmxkIQ==",
	"--BOUND--",
].join("\r\n");

const QP_LATIN1 = [
	"Message-ID: <qp@example.com>",
	"From: a@example.com",
	"To: b@example.com",
	"Subject: QP",
	"Content-Type: text/plain; charset=iso-8859-1",
	"Content-Transfer-Encoding: quoted-printable",
	"",
	"=A1Hola=20mundo!",
].join("\r\n");

describe("parseMessage", () => {
	it("parses plain text message", () => {
		const m = parseMessage(SIMPLE_PLAIN);
		expect(m.messageId).toBe("abc@example.com");
		expect(m.from.address).toBe("alice@example.com");
		expect(m.from.name).toBe("Alice");
		expect(m.to.length).toBe(2);
		expect(m.to[0]?.address).toBe("bob@example.org");
		expect(m.subject).toBe("Hello there");
		expect(m.textBody?.trim()).toBe("Hello body");
		expect(m.htmlBody).toBeUndefined();
		expect(m.attachments.length).toBe(0);
	});

	it("decodes RFC 2047 encoded subjects", () => {
		const m = parseMessage(ENCODED_SUBJECT);
		expect(m.subject).toBe("Hello World");
	});

	it("walks multipart/mixed and extracts text + html + attachments", () => {
		const m = parseMessage(MULTIPART);
		expect(m.textBody?.trim()).toBe("plain text");
		expect(m.htmlBody?.trim()).toBe("<p>html</p>");
		expect(m.attachments.length).toBe(1);
		const att = m.attachments[0];
		expect(att?.filename).toBe("invoice.pdf");
		expect(att?.contentType).toBe("application/pdf");
		expect(new TextDecoder().decode(att?.content)).toBe("Hello, world!");
	});

	it("decodes quoted-printable + latin-1 body", () => {
		const m = parseMessage(QP_LATIN1);
		expect(m.textBody).toBe("¡Hola mundo!");
	});

	it("synthesises a message id when missing", () => {
		const raw = ["From: x@y.com", "To: a@b.com", "Subject: x", "", "body"].join(
			"\r\n",
		);
		const m = parseMessage(raw);
		expect(m.messageId.length).toBeGreaterThan(10);
	});

	it("rejects oversized messages", () => {
		const big = `From: x@y.com\r\nTo: a@b.com\r\nSubject: x\r\n\r\n${"A".repeat(31 * 1024 * 1024)}`;
		expect(() => parseMessage(big)).toThrow(MessageTooLargeError);
	});

	it("parses address lists with display names", () => {
		const list = parseAddressList(
			'"Alice Smith" <alice@example.com>, bob@example.com, =?utf-8?B?Q2Fyb2w=?= <c@example.com>',
		);
		expect(list.length).toBe(3);
		expect(list[0]?.name).toBe("Alice Smith");
		expect(list[2]?.name).toBe("Carol");
	});
});
