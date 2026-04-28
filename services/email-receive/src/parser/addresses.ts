/**
 * RFC 5322 address-list parser — pragmatic, not a full grammar.
 * Handles "Name <addr@host>", bare "addr@host", "<addr@host>",
 * quoted display names with commas, and groups (which we flatten).
 */

import type { Mailbox } from "../types/index.ts";
import { decodeEncodedWord } from "./decode.ts";

export function parseAddressList(input: string): Mailbox[] {
	if (!input || input.trim().length === 0) return [];
	const parts = splitAddressList(input);
	const out: Mailbox[] = [];
	for (const part of parts) {
		const mb = parseSingleAddress(part);
		if (mb !== null) out.push(mb);
	}
	return out;
}

function splitAddressList(input: string): string[] {
	const out: string[] = [];
	let buf = "";
	let inQuotes = false;
	let inAngles = false;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
			buf += ch;
			continue;
		}
		if (!inQuotes && ch === "<") {
			inAngles = true;
			buf += ch;
			continue;
		}
		if (!inQuotes && ch === ">") {
			inAngles = false;
			buf += ch;
			continue;
		}
		if (!inQuotes && !inAngles && ch === ",") {
			out.push(buf);
			buf = "";
			continue;
		}
		buf += ch ?? "";
	}
	if (buf.trim().length > 0) out.push(buf);
	return out;
}

export function parseSingleAddress(input: string): Mailbox | null {
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;
	// Group syntax: "name: a@x, b@y;" — strip group label, re-parse first.
	const groupMatch = /^[^:<>]+:(.*);$/.exec(trimmed);
	if (groupMatch !== null) {
		const inner = groupMatch[1] ?? "";
		const list = parseAddressList(inner);
		return list[0] ?? null;
	}
	const angleStart = trimmed.lastIndexOf("<");
	const angleEnd = trimmed.lastIndexOf(">");
	if (angleStart >= 0 && angleEnd > angleStart) {
		const address = trimmed.slice(angleStart + 1, angleEnd).trim();
		if (!isPlausibleEmail(address)) return null;
		const namePart = trimmed.slice(0, angleStart).trim();
		const decoded = decodeEncodedWord(stripQuotes(namePart));
		const result: Mailbox = decoded.length > 0
			? { address, name: decoded }
			: { address };
		return result;
	}
	if (isPlausibleEmail(trimmed)) {
		return { address: trimmed };
	}
	return null;
}

function stripQuotes(input: string): string {
	const t = input.trim();
	if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
		return t.slice(1, -1);
	}
	return t;
}

export function isPlausibleEmail(input: string): boolean {
	// Pragmatic check: localpart@domain, no whitespace, has a dot in domain.
	if (input.includes(" ")) return false;
	const at = input.lastIndexOf("@");
	if (at <= 0 || at >= input.length - 1) return false;
	const local = input.slice(0, at);
	const domain = input.slice(at + 1);
	if (local.length === 0 || local.length > 64) return false;
	if (domain.length === 0 || domain.length > 255) return false;
	if (!domain.includes(".")) return false;
	return true;
}
