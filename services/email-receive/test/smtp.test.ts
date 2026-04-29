import { describe, expect, it } from "bun:test";
import {
	SmtpSession,
	extractAngleAddr,
	formatMultiline,
	formatResponse,
	type SmtpHandler,
} from "../src/smtp/server.ts";
import type { SmtpEnvelope } from "../src/types/index.ts";

class CapturingHandler implements SmtpHandler {
	public messages: Array<{ envelope: SmtpEnvelope; raw: string }> = [];
	public throwNext = false;
	async onMessage(envelope: SmtpEnvelope, raw: string): Promise<void> {
		if (this.throwNext) throw new Error("boom");
		this.messages.push({ envelope, raw });
	}
}

async function runSession(
	lines: string[],
	handler: SmtpHandler = new CapturingHandler(),
	opts: { maxMessageBytes?: number; tlsActive?: boolean } = {},
) {
	const session = new SmtpSession({
		hostname: "mx.test",
		remoteAddress: "10.0.0.1",
		handler,
		...(opts.maxMessageBytes !== undefined
			? { maxMessageBytes: opts.maxMessageBytes }
			: {}),
		...(opts.tlsActive !== undefined ? { tlsActive: opts.tlsActive } : {}),
	});
	const responses: string[] = [];
	for (const line of lines) {
		const r = await session.handleLine(line);
		responses.push(formatMultiline(r));
	}
	return { session, responses };
}

describe("extractAngleAddr", () => {
	it("extracts angle-bracketed addresses", () => {
		expect(extractAngleAddr(" <a@b.com>")).toBe("a@b.com");
	});
	it("returns empty string for null sender", () => {
		expect(extractAngleAddr(" <>")).toBe("");
	});
	it("falls back to bare address", () => {
		expect(extractAngleAddr(" a@b.com")).toBe("a@b.com");
	});
	it("rejects invalid syntax", () => {
		expect(extractAngleAddr(" not an email ")).toBeNull();
	});
});

describe("formatResponse / formatMultiline", () => {
	it("formats single-line response", () => {
		expect(formatResponse({ code: 250, message: "OK" })).toBe("250 OK\r\n");
	});
	it("uses dash continuation in multi-line", () => {
		const out = formatMultiline([
			{ code: 250, message: "hello" },
			{ code: 250, message: "SIZE 30000000" },
			{ code: 250, message: "HELP" },
		]);
		expect(out).toContain("250-hello");
		expect(out).toContain("250 HELP");
	});
});

describe("SmtpSession state machine", () => {
	it("greets on construction", async () => {
		const session = new SmtpSession({
			hostname: "mx.test",
			remoteAddress: "10.0.0.1",
			handler: new CapturingHandler(),
		});
		const greet = session.greeting();
		expect(greet.code).toBe(220);
	});

	it("accepts a complete mail transaction", async () => {
		const handler = new CapturingHandler();
		const { session } = await runSession(
			[
				"EHLO client.example.com\r\n",
				"MAIL FROM:<sender@example.com>\r\n",
				"RCPT TO:<rcpt@acme.crontech.dev>\r\n",
				"DATA\r\n",
				"From: sender@example.com\r\n",
				"To: rcpt@acme.crontech.dev\r\n",
				"Subject: hi\r\n",
				"\r\n",
				"hello body\r\n",
				".\r\n",
				"QUIT\r\n",
			],
			handler,
		);
		expect(handler.messages.length).toBe(1);
		const msg = handler.messages[0];
		expect(msg?.envelope.mailFrom).toBe("sender@example.com");
		expect(msg?.envelope.rcptTo).toEqual(["rcpt@acme.crontech.dev"]);
		expect(msg?.raw).toContain("Subject: hi");
		expect(session.getState()).toBe("QUIT");
	});

	it("rejects RCPT before MAIL FROM", async () => {
		const { responses } = await runSession([
			"HELO test\r\n",
			"RCPT TO:<x@y.com>\r\n",
		]);
		expect(responses[1]).toContain("503");
	});

	it("rejects DATA before RCPT", async () => {
		const { responses } = await runSession([
			"HELO test\r\n",
			"MAIL FROM:<x@y.com>\r\n",
			"DATA\r\n",
		]);
		expect(responses[2]).toContain("503");
	});

	it("handles RSET", async () => {
		const { session } = await runSession([
			"HELO test\r\n",
			"MAIL FROM:<x@y.com>\r\n",
			"RCPT TO:<a@b.com>\r\n",
			"RSET\r\n",
		]);
		expect(session.getState()).toBe("AFTER_HELO");
	});

	it("strips leading dots per RFC 5321 dot-stuffing", async () => {
		const handler = new CapturingHandler();
		await runSession(
			[
				"HELO test\r\n",
				"MAIL FROM:<x@y.com>\r\n",
				"RCPT TO:<a@b.com>\r\n",
				"DATA\r\n",
				"From: x\r\n",
				"\r\n",
				"..dotted line\r\n",
				".\r\n",
			],
			handler,
		);
		expect(handler.messages[0]?.raw).toContain(".dotted line");
		expect(handler.messages[0]?.raw).not.toContain("..dotted line");
	});

	it("rejects oversized DATA with 552", async () => {
		const handler = new CapturingHandler();
		const big = "X".repeat(2000);
		const { responses } = await runSession(
			[
				"HELO test\r\n",
				"MAIL FROM:<x@y.com>\r\n",
				"RCPT TO:<a@b.com>\r\n",
				"DATA\r\n",
				`${big}\r\n`,
				`${big}\r\n`,
				".\r\n",
			],
			handler,
			{ maxMessageBytes: 1000 },
		);
		const last = responses[responses.length - 1];
		expect(last).toContain("552");
		expect(handler.messages.length).toBe(0);
	});

	it("returns 451 when handler throws", async () => {
		const handler = new CapturingHandler();
		handler.throwNext = true;
		const { responses } = await runSession(
			[
				"HELO test\r\n",
				"MAIL FROM:<x@y.com>\r\n",
				"RCPT TO:<a@b.com>\r\n",
				"DATA\r\n",
				"body\r\n",
				".\r\n",
			],
			handler,
		);
		expect(responses[responses.length - 1]).toContain("451");
	});

	it("advertises STARTTLS in EHLO when not yet TLS", async () => {
		const { responses } = await runSession(["EHLO test\r\n"]);
		expect(responses[0]).toContain("STARTTLS");
	});

	it("does not advertise STARTTLS when already TLS", async () => {
		const { responses } = await runSession(["EHLO test\r\n"], undefined, {
			tlsActive: true,
		});
		expect(responses[0]).not.toContain("STARTTLS");
	});

	it("rejects unknown commands with 500", async () => {
		const { responses } = await runSession(["WHAT\r\n"]);
		expect(responses[0]).toContain("500");
	});
});
