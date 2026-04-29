/**
 * Per-tenant source-URL allowlist enforcement.
 *
 * Crontech NEVER proxies arbitrary URLs.  An attacker who could pass
 * `?src=http://169.254.169.254/…` would otherwise turn the optimizer
 * into a generic SSRF gadget.  Every tenant declares an explicit list
 * of host patterns; anything outside that list is rejected with 403.
 *
 * Patterns:
 *   - "example.com"          → exact host match
 *   - "*.example.com"        → any subdomain (single or multi level)
 *   - "cdn.example.com:443"  → host + port match
 */

import { OptimizerError } from "./types.ts";

export interface AllowlistConfig {
	/** Map of tenant id → list of host patterns. */
	tenants: Record<string, readonly string[]>;
	/**
	 * Optional "default" tenant used when the request does not carry an
	 * explicit tenant id.  Useful for single-tenant deployments.
	 */
	defaultTenant?: string;
}

export class Allowlist {
	private readonly config: AllowlistConfig;

	constructor(config: AllowlistConfig) {
		this.config = config;
	}

	/**
	 * Throws `OptimizerError(SOURCE_NOT_ALLOWED, …, 403)` if the URL is
	 * not on the tenant's allowlist.  Returns silently on success.
	 */
	assertAllowed(srcUrl: string, tenantId?: string): void {
		const tenant = tenantId ?? this.config.defaultTenant;
		if (!tenant) {
			throw new OptimizerError(
				"SOURCE_NOT_ALLOWED",
				"no tenant specified and no default tenant configured",
				403,
			);
		}
		const patterns = this.config.tenants[tenant];
		if (!patterns || patterns.length === 0) {
			throw new OptimizerError(
				"SOURCE_NOT_ALLOWED",
				`tenant '${tenant}' has no allowlist entries`,
				403,
			);
		}

		let host: string;
		let port: string;
		try {
			const u = new URL(srcUrl);
			host = u.hostname.toLowerCase();
			port = u.port;
		} catch {
			throw new OptimizerError(
				"SOURCE_NOT_ALLOWED",
				"src is not a valid URL",
				403,
			);
		}

		const matches = patterns.some((p) => matchPattern(host, port, p));
		if (!matches) {
			throw new OptimizerError(
				"SOURCE_NOT_ALLOWED",
				`host '${host}' is not on the allowlist for tenant '${tenant}'`,
				403,
			);
		}
	}
}

function matchPattern(host: string, port: string, pattern: string): boolean {
	const lower = pattern.toLowerCase();
	const [patternHost, patternPort] = lower.includes(":")
		? splitOnce(lower, ":")
		: [lower, undefined];
	if (patternPort !== undefined && patternPort !== port) return false;

	if (patternHost === undefined) return false;
	if (patternHost.startsWith("*.")) {
		const suffix = patternHost.slice(2);
		// `*.example.com` should match `a.example.com` and `a.b.example.com`,
		// but NOT `example.com` itself (use a separate entry for that).
		return host.endsWith(`.${suffix}`);
	}
	return host === patternHost;
}

function splitOnce(s: string, sep: string): [string, string] {
	const idx = s.indexOf(sep);
	if (idx < 0) return [s, ""];
	return [s.slice(0, idx), s.slice(idx + 1)];
}
