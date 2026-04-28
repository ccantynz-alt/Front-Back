/**
 * Minimal RFC 5321 SMTP receiver. Accepts inbound mail, hands the parsed
 * envelope + raw bytes to an injected handler. Designed to be testable
 * without opening a real socket — the protocol state machine is exposed
 * directly via SmtpSession, and Bun.listen wires it to a TCP socket only
 * in production. Optional STARTTLS upgrade hook is exposed but defaults
 * to unimplemented (configured via `tls` option).
 */

import type { SmtpEnvelope } from "../types/index.ts";

const MAX_DATA_BYTES = 30 * 1024 * 1024;

export interface SmtpHandler {
	onMessage(envelope: SmtpEnvelope, raw: string): Promise<void>;
}

export interface SmtpServerOptions {
	readonly hostname: string;
	readonly maxMessageBytes?: number;
	readonly tls?: boolean;
	readonly handler: SmtpHandler;
}

type State =
	| "GREET"
	| "AFTER_HELO"
	| "AFTER_MAIL_FROM"
	| "AFTER_RCPT_TO"
	| "DATA"
	| "QUIT";

export interface SmtpResponse {
	readonly code: number;
	readonly message: string;
}

/**
 * Stateful, in-memory SMTP session. One instance per connection. Caller
 * feeds command lines via `handleLine` (during commands) or raw chunks via
 * `handleDataChunk` (during DATA). The session emits responses for each
 * command. When the DATA dot terminator is seen, `onMessage` fires.
 */
export class SmtpSession {
	private state: State = "GREET";
	private heloName = "";
	private mailFrom = "";
	private rcptTo: string[] = [];
	private dataBuffer = "";
	private readonly remoteAddress: string;
	private readonly hostname: string;
	private readonly maxMessageBytes: number;
	private readonly handler: SmtpHandler;
	private readonly tlsActive: boolean;
	private oversize = false;

	constructor(opts: {
		hostname: string;
		remoteAddress: string;
		maxMessageBytes?: number;
		handler: SmtpHandler;
		tlsActive?: boolean;
	}) {
		this.hostname = opts.hostname;
		this.remoteAddress = opts.remoteAddress;
		this.maxMessageBytes = opts.maxMessageBytes ?? MAX_DATA_BYTES;
		this.handler = opts.handler;
		this.tlsActive = opts.tlsActive ?? false;
	}

	greeting(): SmtpResponse {
		return {
			code: 220,
			message: `${this.hostname} Crontech ESMTP ready`,
		};
	}

	getState(): State {
		return this.state;
	}

	isInData(): boolean {
		return this.state === "DATA";
	}

	async handleLine(line: string): Promise<SmtpResponse[]> {
		if (this.state === "DATA") {
			return await this.handleDataLine(line);
		}
		const trimmed = line.replace(/\r?\n$/, "");
		const upper = trimmed.toUpperCase();
		if (upper.startsWith("HELO ")) {
			this.heloName = trimmed.slice(5).trim();
			this.state = "AFTER_HELO";
			return [{ code: 250, message: `${this.hostname} hello ${this.heloName}` }];
		}
		if (upper.startsWith("EHLO ")) {
			this.heloName = trimmed.slice(5).trim();
			this.state = "AFTER_HELO";
			const lines: SmtpResponse[] = [
				{ code: 250, message: `${this.hostname} hello ${this.heloName}` },
				{ code: 250, message: `SIZE ${this.maxMessageBytes}` },
				{ code: 250, message: "8BITMIME" },
				{ code: 250, message: "PIPELINING" },
			];
			if (!this.tlsActive) lines.push({ code: 250, message: "STARTTLS" });
			lines.push({ code: 250, message: "HELP" });
			return lines;
		}
		if (upper === "STARTTLS") {
			if (this.tlsActive) {
				return [{ code: 503, message: "TLS already active" }];
			}
			return [{ code: 220, message: "Ready to start TLS" }];
		}
		if (upper.startsWith("MAIL FROM:")) {
			if (this.state !== "AFTER_HELO" && this.state !== "AFTER_MAIL_FROM") {
				return [{ code: 503, message: "send HELO/EHLO first" }];
			}
			const addr = extractAngleAddr(trimmed.slice("MAIL FROM:".length));
			if (addr === null) {
				return [{ code: 501, message: "syntax error in MAIL FROM" }];
			}
			this.mailFrom = addr;
			this.rcptTo = [];
			this.state = "AFTER_MAIL_FROM";
			return [{ code: 250, message: "OK" }];
		}
		if (upper.startsWith("RCPT TO:")) {
			if (
				this.state !== "AFTER_MAIL_FROM" &&
				this.state !== "AFTER_RCPT_TO"
			) {
				return [{ code: 503, message: "need MAIL FROM first" }];
			}
			const addr = extractAngleAddr(trimmed.slice("RCPT TO:".length));
			if (addr === null) {
				return [{ code: 501, message: "syntax error in RCPT TO" }];
			}
			this.rcptTo.push(addr);
			this.state = "AFTER_RCPT_TO";
			return [{ code: 250, message: "OK" }];
		}
		if (upper === "DATA") {
			if (this.state !== "AFTER_RCPT_TO") {
				return [{ code: 503, message: "need recipients first" }];
			}
			this.state = "DATA";
			this.dataBuffer = "";
			this.oversize = false;
			return [{ code: 354, message: "End data with <CR><LF>.<CR><LF>" }];
		}
		if (upper === "RSET") {
			this.mailFrom = "";
			this.rcptTo = [];
			this.dataBuffer = "";
			this.oversize = false;
			this.state = this.heloName.length > 0 ? "AFTER_HELO" : "GREET";
			return [{ code: 250, message: "OK" }];
		}
		if (upper === "NOOP") {
			return [{ code: 250, message: "OK" }];
		}
		if (upper === "QUIT") {
			this.state = "QUIT";
			return [{ code: 221, message: `${this.hostname} closing` }];
		}
		if (upper === "HELP") {
			return [{ code: 214, message: "HELO EHLO MAIL RCPT DATA RSET NOOP QUIT" }];
		}
		return [{ code: 500, message: "unknown command" }];
	}

	private async handleDataLine(line: string): Promise<SmtpResponse[]> {
		const stripped = line.replace(/\r?\n$/, "");
		if (stripped === ".") {
			if (this.oversize) {
				this.resetAfterMessage();
				return [{ code: 552, message: "message too large" }];
			}
			const envelope: SmtpEnvelope = {
				remoteAddress: this.remoteAddress,
				heloName: this.heloName,
				mailFrom: this.mailFrom,
				rcptTo: [...this.rcptTo],
				receivedAt: new Date(),
				tls: this.tlsActive,
			};
			const raw = this.dataBuffer;
			this.resetAfterMessage();
			try {
				await this.handler.onMessage(envelope, raw);
				return [{ code: 250, message: "queued" }];
			} catch (err) {
				const msg = err instanceof Error ? err.message : "internal error";
				return [{ code: 451, message: `temporary failure: ${msg}` }];
			}
		}
		// RFC 5321 §4.5.2: lines beginning with "." get an extra "." stripped.
		const decoded = stripped.startsWith("..") ? stripped.slice(1) : stripped;
		const next = `${this.dataBuffer}${decoded}\r\n`;
		if (next.length > this.maxMessageBytes) {
			this.oversize = true;
			// Keep consuming lines until DOT, but stop appending.
			return [];
		}
		this.dataBuffer = next;
		return [];
	}

	private resetAfterMessage(): void {
		this.mailFrom = "";
		this.rcptTo = [];
		this.dataBuffer = "";
		this.oversize = false;
		this.state = "AFTER_HELO";
	}
}

export function extractAngleAddr(input: string): string | null {
	const trimmed = input.trim();
	const lt = trimmed.indexOf("<");
	const gt = trimmed.indexOf(">");
	if (lt < 0 || gt < 0 || gt <= lt) {
		// Bare address fallback: "MAIL FROM:user@host"
		if (trimmed.includes("@") && !trimmed.includes(" ")) {
			return trimmed.toLowerCase();
		}
		return null;
	}
	const addr = trimmed.slice(lt + 1, gt).trim();
	if (addr.length === 0) return ""; // "<>" is the legitimate null sender.
	if (!addr.includes("@")) return null;
	return addr.toLowerCase();
}

export function formatResponse(res: SmtpResponse): string {
	return `${res.code} ${res.message}\r\n`;
}

export function formatMultiline(lines: ReadonlyArray<SmtpResponse>): string {
	if (lines.length === 0) return "";
	let out = "";
	for (let i = 0; i < lines.length; i++) {
		const item = lines[i];
		if (item === undefined) continue;
		const sep = i === lines.length - 1 ? " " : "-";
		out += `${item.code}${sep}${item.message}\r\n`;
	}
	return out;
}

export interface SmtpServerHandle {
	readonly port: number;
	close(): Promise<void>;
}

/**
 * Production listener. Wires SmtpSession to a Bun TCP socket. Tests should
 * exercise SmtpSession directly rather than spinning up a real listener.
 */
export async function startSmtpListener(
	options: SmtpServerOptions & { port: number },
): Promise<SmtpServerHandle> {
	const { hostname, port, handler, maxMessageBytes, tls } = options;
	const server = Bun.listen<{ session: SmtpSession; buffer: string }>({
		hostname: "0.0.0.0",
		port,
		socket: {
			open(socket) {
				const session = new SmtpSession({
					hostname,
					remoteAddress: socket.remoteAddress ?? "unknown",
					...(maxMessageBytes !== undefined ? { maxMessageBytes } : {}),
					handler,
					tlsActive: tls === true,
				});
				socket.data = { session, buffer: "" };
				socket.write(formatResponse(session.greeting()));
			},
			async data(socket, data) {
				const ctx = socket.data;
				ctx.buffer += data.toString();
				let idx: number;
				idx = ctx.buffer.indexOf("\n");
				while (idx >= 0) {
					const line = ctx.buffer.slice(0, idx + 1);
					ctx.buffer = ctx.buffer.slice(idx + 1);
					const responses = await ctx.session.handleLine(line);
					if (responses.length > 0) {
						socket.write(formatMultiline(responses));
					}
					if (ctx.session.getState() === "QUIT") {
						socket.end();
						return;
					}
					idx = ctx.buffer.indexOf("\n");
				}
			},
			close() {},
			error(_socket, error) {
				// In production this would route to OpenTelemetry.
				console.error("smtp socket error", error);
			},
		},
	});
	return {
		port: server.port,
		async close() {
			server.stop(true);
		},
	};
}
