/**
 * IP allocator for the WireGuard tunnel network.
 *
 * Allocates sequential /32 host addresses out of a configured CIDR (default
 * `10.42.0.0/16` = 65 534 usable hosts). Tracks used addresses and reclaims
 * freed ones. Reclaimed addresses are reused before new ones are issued.
 *
 * The .0 (network) and the broadcast addr are reserved. .1 is reserved for the
 * control plane itself (acts as the implicit gateway) so allocation starts at .2.
 */

interface Cidr {
	baseInt: number;
	mask: number;
	hostBits: number;
	first: number; // first usable host (inclusive)
	last: number; // last usable host (inclusive)
}

function ipToInt(ip: string): number {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
		throw new Error(`invalid IPv4: ${ip}`);
	}
	const [a, b, c, d] = parts as [number, number, number, number];
	// Use unsigned 32-bit math via >>> 0 to avoid sign issues.
	return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function intToIp(n: number): string {
	return [
		(n >>> 24) & 0xff,
		(n >>> 16) & 0xff,
		(n >>> 8) & 0xff,
		n & 0xff,
	].join(".");
}

function parseCidr(cidr: string): Cidr {
	const [base, prefixStr] = cidr.split("/");
	if (!base || !prefixStr) {
		throw new Error(`invalid CIDR: ${cidr}`);
	}
	const mask = Number(prefixStr);
	if (!Number.isInteger(mask) || mask < 0 || mask > 32) {
		throw new Error(`invalid CIDR prefix: ${cidr}`);
	}
	const baseInt = ipToInt(base);
	const hostBits = 32 - mask;
	// Reserve .0 (network), broadcast, and .1 (control plane gateway).
	const first = baseInt + 2;
	const last = hostBits === 0 ? baseInt : baseInt + 2 ** hostBits - 2;
	if (first > last) {
		throw new Error(`CIDR too small to allocate any host: ${cidr}`);
	}
	return { baseInt, mask, hostBits, first, last };
}

export class IpAllocator {
	private readonly cidr: Cidr;
	private readonly cidrString: string;
	private readonly used = new Set<number>();
	private readonly freed: number[] = [];
	private cursor: number;

	constructor(cidr: string) {
		this.cidrString = cidr;
		this.cidr = parseCidr(cidr);
		this.cursor = this.cidr.first;
	}

	/** Allocate the next available /32 inside the configured CIDR. */
	allocate(): string {
		const reused = this.freed.shift();
		if (reused !== undefined) {
			this.used.add(reused);
			return `${intToIp(reused)}/32`;
		}
		while (this.cursor <= this.cidr.last) {
			const candidate = this.cursor;
			this.cursor += 1;
			if (!this.used.has(candidate)) {
				this.used.add(candidate);
				return `${intToIp(candidate)}/32`;
			}
		}
		throw new Error(`IP pool exhausted for ${this.cidrString}`);
	}

	/**
	 * Mark an IP back to the free pool. Accepts either bare `1.2.3.4` or `1.2.3.4/32`.
	 * Idempotent: freeing an already-free IP is a no-op.
	 */
	free(ip: string): void {
		const bare = ip.includes("/") ? ip.split("/")[0] : ip;
		if (!bare) return;
		const n = ipToInt(bare);
		if (this.used.delete(n)) {
			this.freed.push(n);
		}
	}

	/** Reserve an existing allocation (used when restoring state). */
	reserve(ip: string): void {
		const bare = ip.includes("/") ? ip.split("/")[0] : ip;
		if (!bare) return;
		const n = ipToInt(bare);
		if (n < this.cidr.first || n > this.cidr.last) {
			throw new Error(`${ip} is outside ${this.cidrString}`);
		}
		this.used.add(n);
		if (n >= this.cursor) this.cursor = n + 1;
	}

	get usedCount(): number {
		return this.used.size;
	}

	get capacity(): number {
		return this.cidr.last - this.cidr.first + 1;
	}
}
