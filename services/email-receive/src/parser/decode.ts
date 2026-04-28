/**
 * Encoding decoders for SMTP messages.
 * Pure TS — zero native deps. Handles base64, quoted-printable, RFC 2047
 * encoded-word headers, and a pragmatic subset of charsets (utf-8, ascii,
 * latin1, iso-8859-1, windows-1252).
 */

const SUPPORTED_CHARSETS = new Set([
	"utf-8",
	"utf8",
	"us-ascii",
	"ascii",
	"latin1",
	"iso-8859-1",
	"iso8859-1",
	"windows-1252",
	"cp1252",
]);

function normalizeCharset(charset: string): string {
	return charset.trim().toLowerCase();
}

export function decodeBase64(input: string): Uint8Array {
	const cleaned = input.replace(/[\r\n\s]+/g, "");
	if (cleaned.length === 0) return new Uint8Array(0);
	// Bun + node compat: Buffer is available globally under bun runtime.
	return new Uint8Array(Buffer.from(cleaned, "base64"));
}

export function decodeQuotedPrintable(input: string): Uint8Array {
	const out: number[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (ch === 0x3d /* = */) {
			const next = input[i + 1];
			const next2 = input[i + 2];
			// Soft line break: "=\r\n" or "=\n"
			if (next === "\r" && next2 === "\n") {
				i += 3;
				continue;
			}
			if (next === "\n") {
				i += 2;
				continue;
			}
			if (
				next !== undefined &&
				next2 !== undefined &&
				/[0-9A-Fa-f]/.test(next) &&
				/[0-9A-Fa-f]/.test(next2)
			) {
				out.push(parseInt(`${next}${next2}`, 16));
				i += 3;
				continue;
			}
			// Malformed escape — emit literal "=".
			out.push(0x3d);
			i += 1;
			continue;
		}
		out.push(ch);
		i += 1;
	}
	return new Uint8Array(out);
}

export function bytesToString(bytes: Uint8Array, charset: string): string {
	const cs = normalizeCharset(charset);
	if (!SUPPORTED_CHARSETS.has(cs)) {
		// Fallback: replace unknown bytes with U+FFFD via TextDecoder fatal:false utf-8.
		return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	}
	if (cs === "utf-8" || cs === "utf8") {
		return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	}
	if (cs === "us-ascii" || cs === "ascii") {
		// Strict ASCII: high bits emit replacement.
		let out = "";
		for (const b of bytes) {
			out += b < 0x80 ? String.fromCharCode(b) : "�";
		}
		return out;
	}
	// latin1 / iso-8859-1 / windows-1252 — TextDecoder handles them.
	const tdName =
		cs === "windows-1252" || cs === "cp1252" ? "windows-1252" : "iso-8859-1";
	try {
		return new TextDecoder(tdName, { fatal: false }).decode(bytes);
	} catch {
		// Older runtimes may not have iso-8859-1; fall back to byte map.
		let out = "";
		for (const b of bytes) out += String.fromCharCode(b);
		return out;
	}
}

/**
 * Decode an RFC 2047 encoded-word header value.
 * Examples:
 *   "=?utf-8?B?SGVsbG8=?="  → "Hello"
 *   "=?iso-8859-1?Q?=A1Hola?=" → "¡Hola"
 * Words separated by whitespace alone are joined without the whitespace.
 */
export function decodeEncodedWord(input: string): string {
	const tokenRegex = /=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g;
	let result = "";
	let lastIndex = 0;
	let prevWasEncoded = false;
	let match: RegExpExecArray | null = tokenRegex.exec(input);
	while (match !== null) {
		const between = input.slice(lastIndex, match.index);
		// RFC 2047: when two encoded-words are separated only by linear whitespace,
		// drop the whitespace.
		if (prevWasEncoded && /^[\s]*$/.test(between)) {
			// drop
		} else {
			result += between;
		}
		const charset = match[1] ?? "utf-8";
		const enc = (match[2] ?? "Q").toUpperCase();
		const data = match[3] ?? "";
		let bytes: Uint8Array;
		if (enc === "B") {
			bytes = decodeBase64(data);
		} else {
			// Q-encoding: underscores are spaces.
			bytes = decodeQuotedPrintable(data.replace(/_/g, " "));
		}
		result += bytesToString(bytes, charset);
		lastIndex = match.index + match[0].length;
		prevWasEncoded = true;
		match = tokenRegex.exec(input);
	}
	result += input.slice(lastIndex);
	return result;
}
