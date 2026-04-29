/**
 * Pre-filtering rules. Cheap, deterministic checks before AI classification
 * (v2). Kept separate so spam logic can grow without touching the pipeline.
 */

import type { ParsedMessage } from "../types/index.ts";

export interface SpamSignal {
	readonly reason: string;
	readonly score: number;
}

export interface SpamPrefilterResult {
	readonly isSpam: boolean;
	readonly score: number;
	readonly signals: ReadonlyArray<SpamSignal>;
}

const SPAM_KEYWORDS = [
	"viagra",
	"cialis",
	"nigerian prince",
	"crypto giveaway",
	"act now",
	"limited time offer",
	"100% free",
	"weight loss miracle",
];

const SUSPICIOUS_TLDS = [".zip", ".mov", ".click", ".top"];

const SPAM_THRESHOLD = 5;

export function prefilter(message: ParsedMessage): SpamPrefilterResult {
	const signals: SpamSignal[] = [];
	const subjectLower = message.subject.toLowerCase();
	const bodyLower = (
		message.textBody ??
		message.htmlBody ??
		""
	).toLowerCase();

	for (const kw of SPAM_KEYWORDS) {
		if (subjectLower.includes(kw)) {
			signals.push({ reason: `keyword in subject: ${kw}`, score: 3 });
		}
		if (bodyLower.includes(kw)) {
			signals.push({ reason: `keyword in body: ${kw}`, score: 2 });
		}
	}

	const fromDomain = extractDomain(message.from.address);
	if (fromDomain !== null) {
		for (const tld of SUSPICIOUS_TLDS) {
			if (fromDomain.endsWith(tld)) {
				signals.push({
					reason: `suspicious sender TLD: ${tld}`,
					score: 4,
				});
			}
		}
	}

	if (subjectLower === "" || subjectLower === "(no subject)") {
		signals.push({ reason: "empty subject", score: 1 });
	}

	if (
		message.textBody === undefined &&
		message.htmlBody === undefined &&
		message.attachments.length === 0
	) {
		signals.push({ reason: "empty body", score: 2 });
	}

	const score = signals.reduce((acc, s) => acc + s.score, 0);
	return {
		isSpam: score >= SPAM_THRESHOLD,
		score,
		signals,
	};
}

function extractDomain(address: string): string | null {
	const at = address.lastIndexOf("@");
	if (at < 0) return null;
	return address.slice(at + 1).toLowerCase();
}
