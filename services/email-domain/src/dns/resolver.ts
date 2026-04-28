/**
 * Pluggable DNS resolver. Production wiring uses Bun/Node `dns/promises`;
 * tests inject a deterministic in-memory map.
 */

import { promises as dnsPromises } from "node:dns";
import type { DnsResolver } from "../types.ts";

export class SystemDnsResolver implements DnsResolver {
	async resolveTxt(host: string): Promise<string[][]> {
		try {
			return await dnsPromises.resolveTxt(host);
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "ENOTFOUND" || code === "ENODATA") {
				return [];
			}
			throw err;
		}
	}
}

export class StaticDnsResolver implements DnsResolver {
	private readonly records = new Map<string, string[][]>();

	set(host: string, txt: string[][]): void {
		this.records.set(host.toLowerCase(), txt);
	}

	clear(): void {
		this.records.clear();
	}

	async resolveTxt(host: string): Promise<string[][]> {
		return this.records.get(host.toLowerCase()) ?? [];
	}
}
