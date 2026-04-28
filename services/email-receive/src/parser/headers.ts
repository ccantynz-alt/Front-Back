/**
 * RFC 5322 header parsing — splits the header block, unfolds continuation
 * lines, decodes encoded-words, and parses parameterised values like
 * Content-Type and Content-Disposition.
 */

import { decodeEncodedWord } from "./decode.ts";

export interface HeaderField {
	readonly name: string;
	readonly rawValue: string;
	readonly decodedValue: string;
}

export interface ParameterisedValue {
	readonly value: string;
	readonly params: Readonly<Record<string, string>>;
}

const CRLF = /\r?\n/;

/**
 * Splits raw message bytes/string into [headerBlock, body] at the first
 * empty line (CRLF CRLF). Always returns body even if empty.
 */
export function splitHeadersAndBody(raw: string): {
	headerBlock: string;
	body: string;
} {
	// Look for double CRLF or double LF.
	const idx1 = raw.indexOf("\r\n\r\n");
	const idx2 = raw.indexOf("\n\n");
	let splitAt = -1;
	let sepLen = 0;
	if (idx1 >= 0 && (idx2 < 0 || idx1 <= idx2)) {
		splitAt = idx1;
		sepLen = 4;
	} else if (idx2 >= 0) {
		splitAt = idx2;
		sepLen = 2;
	}
	if (splitAt < 0) {
		return { headerBlock: raw, body: "" };
	}
	return {
		headerBlock: raw.slice(0, splitAt),
		body: raw.slice(splitAt + sepLen),
	};
}

/** Unfolds RFC 5322 continuation lines (lines starting with WSP). */
export function unfoldHeaders(headerBlock: string): string[] {
	const lines = headerBlock.split(CRLF);
	const out: string[] = [];
	for (const line of lines) {
		if (line.length === 0) continue;
		const first = line.charCodeAt(0);
		if ((first === 0x20 /* space */ || first === 0x09) /* tab */ && out.length > 0) {
			out[out.length - 1] = `${out[out.length - 1]} ${line.replace(/^[\s]+/, "")}`;
		} else {
			out.push(line);
		}
	}
	return out;
}

export function parseHeaders(headerBlock: string): HeaderField[] {
	const folded = unfoldHeaders(headerBlock);
	const out: HeaderField[] = [];
	for (const line of folded) {
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const name = line.slice(0, colon).trim();
		const rawValue = line.slice(colon + 1).trim();
		out.push({
			name,
			rawValue,
			decodedValue: decodeEncodedWord(rawValue),
		});
	}
	return out;
}

export function findHeader(
	headers: ReadonlyArray<HeaderField>,
	name: string,
): HeaderField | undefined {
	const lower = name.toLowerCase();
	return headers.find((h) => h.name.toLowerCase() === lower);
}

export function findAllHeaders(
	headers: ReadonlyArray<HeaderField>,
	name: string,
): HeaderField[] {
	const lower = name.toLowerCase();
	return headers.filter((h) => h.name.toLowerCase() === lower);
}

/**
 * Parses values like:
 *   "multipart/mixed; boundary=\"abc\"; charset=utf-8"
 * into { value: "multipart/mixed", params: { boundary: "abc", charset: "utf-8" } }.
 */
export function parseParameterisedValue(input: string): ParameterisedValue {
	const parts = splitRespectingQuotes(input, ";");
	const value = (parts[0] ?? "").trim().toLowerCase();
	const params: Record<string, string> = {};
	for (let i = 1; i < parts.length; i++) {
		const segment = parts[i];
		if (segment === undefined) continue;
		const eq = segment.indexOf("=");
		if (eq < 0) continue;
		const key = segment.slice(0, eq).trim().toLowerCase();
		let v = segment.slice(eq + 1).trim();
		if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
			v = v.slice(1, -1).replace(/\\(.)/g, "$1");
		}
		if (key.length > 0) params[key] = v;
	}
	return { value, params };
}

function splitRespectingQuotes(input: string, sep: string): string[] {
	const out: string[] = [];
	let buf = "";
	let inQuotes = false;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
			buf += ch;
			continue;
		}
		if (!inQuotes && ch === sep) {
			out.push(buf);
			buf = "";
			continue;
		}
		buf += ch ?? "";
	}
	if (buf.length > 0) out.push(buf);
	return out;
}
