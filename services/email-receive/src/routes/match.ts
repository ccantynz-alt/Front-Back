/**
 * Route matching for inbound recipients.
 * Patterns:
 *   "support@acme.crontech.dev"     — exact
 *   "support@*.crontech.dev"        — wildcard domain
 *   "*@acme.crontech.dev"           — wildcard local
 *   "*"                             — catch-all
 *
 * Specificity ranking: exact > localpart-only-wildcard > domain-only-wildcard
 *   > full wildcard > catch-all.
 * Routes for the requesting tenantId only; cross-tenant matches are rejected.
 */

import type { InboundRoute } from "../types/index.ts";

export function matchRoute(
	routes: ReadonlyArray<InboundRoute>,
	tenantId: string,
	rcpt: string,
): InboundRoute | null {
	const candidates = routes
		.filter((r) => r.tenantId === tenantId && r.enabled)
		.filter((r) => patternMatches(r.pattern, rcpt))
		.map((r) => ({ route: r, score: specificity(r.pattern) }))
		.sort((a, b) => b.score - a.score);
	return candidates[0]?.route ?? null;
}

export function patternMatches(pattern: string, rcpt: string): boolean {
	if (pattern === "*") return true;
	const lowerPattern = pattern.toLowerCase();
	const lowerRcpt = rcpt.toLowerCase();
	if (!lowerPattern.includes("*")) {
		return lowerPattern === lowerRcpt;
	}
	// Convert glob to regex.
	const escaped = lowerPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(`^${escaped.replace(/\*/g, "[^@\\s]+")}$`);
	return regex.test(lowerRcpt);
}

function specificity(pattern: string): number {
	if (pattern === "*") return 0;
	const wildcards = (pattern.match(/\*/g) ?? []).length;
	if (wildcards === 0) return 1000;
	const at = pattern.indexOf("@");
	if (at < 0) return 100 - wildcards;
	const local = pattern.slice(0, at);
	const domain = pattern.slice(at + 1);
	const localWild = local.includes("*");
	const domainWild = domain.includes("*");
	if (!localWild && domainWild) return 600 - wildcards;
	if (localWild && !domainWild) return 700 - wildcards;
	return 200 - wildcards;
}
