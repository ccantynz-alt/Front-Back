/**
 * MIME multipart parser — walks the part tree recursively.
 * Identifies text/html/plain bodies, attachments, inline parts.
 */

import type { ParsedAttachment } from "../types/index.ts";
import {
	bytesToString,
	decodeBase64,
	decodeQuotedPrintable,
} from "./decode.ts";
import {
	type HeaderField,
	findHeader,
	parseHeaders,
	parseParameterisedValue,
	splitHeadersAndBody,
} from "./headers.ts";

export interface MimePart {
	readonly headers: ReadonlyArray<HeaderField>;
	readonly contentType: string;
	readonly charset: string;
	readonly transferEncoding: string;
	readonly disposition: "attachment" | "inline";
	readonly filename?: string;
	readonly contentId?: string;
	readonly rawBody: string;
	readonly children: ReadonlyArray<MimePart>;
}

export interface WalkedBodies {
	textBody?: string;
	htmlBody?: string;
	attachments: ParsedAttachment[];
}

export function parsePart(raw: string): MimePart {
	const { headerBlock, body } = splitHeadersAndBody(raw);
	const headers = parseHeaders(headerBlock);
	const ctHeader = findHeader(headers, "Content-Type");
	const ct = parseParameterisedValue(ctHeader?.rawValue ?? "text/plain");
	const charset = (ct.params["charset"] ?? "utf-8").toLowerCase();
	const teHeader = findHeader(headers, "Content-Transfer-Encoding");
	const transferEncoding = (teHeader?.rawValue ?? "7bit")
		.trim()
		.toLowerCase();
	const cdHeader = findHeader(headers, "Content-Disposition");
	const cd = parseParameterisedValue(cdHeader?.rawValue ?? "inline");
	const disposition: "attachment" | "inline" =
		cd.value === "attachment" ? "attachment" : "inline";
	const filename = cd.params["filename"] ?? ct.params["name"];
	const cidHeader = findHeader(headers, "Content-ID");
	const contentId = cidHeader?.rawValue
		? cidHeader.rawValue.replace(/^<|>$/g, "")
		: undefined;

	const children: MimePart[] = [];
	if (ct.value.startsWith("multipart/")) {
		const boundary = ct.params["boundary"];
		if (boundary !== undefined && boundary.length > 0) {
			const subParts = splitOnBoundary(body, boundary);
			for (const sp of subParts) children.push(parsePart(sp));
		}
	}

	const part: MimePart = {
		headers,
		contentType: ct.value,
		charset,
		transferEncoding,
		disposition,
		...(filename !== undefined ? { filename } : {}),
		...(contentId !== undefined ? { contentId } : {}),
		rawBody: body,
		children,
	};
	return part;
}

function splitOnBoundary(body: string, boundary: string): string[] {
	const delim = `--${boundary}`;
	const closing = `--${boundary}--`;
	const out: string[] = [];
	const lines = body.split(/\r?\n/);
	let collecting = false;
	let buf: string[] = [];
	for (const line of lines) {
		if (line === closing || line.startsWith(closing)) {
			if (collecting) out.push(buf.join("\r\n"));
			break;
		}
		if (line === delim || line.startsWith(delim)) {
			if (collecting) out.push(buf.join("\r\n"));
			buf = [];
			collecting = true;
			continue;
		}
		if (collecting) buf.push(line);
	}
	return out;
}

export function decodePartBody(part: MimePart): Uint8Array {
	const enc = part.transferEncoding;
	if (enc === "base64") return decodeBase64(part.rawBody);
	if (enc === "quoted-printable") return decodeQuotedPrintable(part.rawBody);
	// 7bit / 8bit / binary — interpret raw string as bytes via latin1 mapping.
	const len = part.rawBody.length;
	const buf = new Uint8Array(len);
	for (let i = 0; i < len; i++) buf[i] = part.rawBody.charCodeAt(i) & 0xff;
	return buf;
}

export function walkBodies(part: MimePart, out: WalkedBodies): void {
	if (part.children.length > 0) {
		// multipart/alternative: prefer html if present, otherwise text.
		// We just walk all children — the first text/html or text/plain wins.
		for (const child of part.children) walkBodies(child, out);
		return;
	}
	const ct = part.contentType;
	const bytes = decodePartBody(part);
	const isAttachment =
		part.disposition === "attachment" ||
		(part.filename !== undefined && !ct.startsWith("text/"));
	if (isAttachment) {
		out.attachments.push({
			filename: part.filename ?? "attachment.bin",
			contentType: ct,
			...(part.contentId !== undefined ? { contentId: part.contentId } : {}),
			disposition: part.disposition,
			size: bytes.length,
			content: bytes,
		});
		return;
	}
	if (ct === "text/plain" && out.textBody === undefined) {
		out.textBody = bytesToString(bytes, part.charset);
		return;
	}
	if (ct === "text/html" && out.htmlBody === undefined) {
		out.htmlBody = bytesToString(bytes, part.charset);
		return;
	}
}
