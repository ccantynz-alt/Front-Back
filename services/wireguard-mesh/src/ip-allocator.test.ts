import { describe, expect, test } from "bun:test";
import { IpAllocator } from "./ip-allocator";

describe("IpAllocator", () => {
	test("allocates sequentially starting at .2", () => {
		const a = new IpAllocator("10.42.0.0/16");
		expect(a.allocate()).toBe("10.42.0.2/32");
		expect(a.allocate()).toBe("10.42.0.3/32");
		expect(a.allocate()).toBe("10.42.0.4/32");
	});

	test("never returns duplicate addresses across many allocations", () => {
		const a = new IpAllocator("10.42.0.0/24"); // small range to stress
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const ip = a.allocate();
			expect(seen.has(ip)).toBe(false);
			seen.add(ip);
		}
	});

	test("free + reuse: freed IPs are handed out before fresh ones", () => {
		const a = new IpAllocator("10.42.0.0/16");
		const x = a.allocate(); // .2
		const y = a.allocate(); // .3
		const z = a.allocate(); // .4
		a.free(x);
		// Next allocate should reuse the freed one before issuing .5.
		expect(a.allocate()).toBe(x);
		expect(a.allocate()).toBe("10.42.0.5/32");
		// y and z untouched.
		expect(y).toBe("10.42.0.3/32");
		expect(z).toBe("10.42.0.4/32");
	});

	test("free is idempotent and tolerant of either /32 or bare form", () => {
		const a = new IpAllocator("10.42.0.0/16");
		const ip = a.allocate();
		a.free(ip);
		a.free(ip); // second free is a no-op
		a.free("10.42.0.99"); // never-allocated, no-op
		expect(a.usedCount).toBe(0);
	});

	test("reserve restores prior allocations and skips them on next allocate", () => {
		const a = new IpAllocator("10.42.0.0/16");
		a.reserve("10.42.0.5/32");
		expect(a.allocate()).toBe("10.42.0.6/32");
	});

	test("throws when the pool is exhausted", () => {
		// /30 = 4 addresses. After reserving net + .1 + broadcast, only .2 is usable.
		const a = new IpAllocator("10.42.0.0/30");
		a.allocate(); // .2 — only allocation possible
		expect(() => a.allocate()).toThrow(/exhausted/);
	});

	test("rejects invalid CIDR or invalid IPs", () => {
		expect(() => new IpAllocator("not-cidr")).toThrow();
		expect(() => new IpAllocator("10.0.0.0/40")).toThrow();
		const a = new IpAllocator("10.42.0.0/16");
		expect(() => a.reserve("nope")).toThrow();
		expect(() => a.reserve("10.99.0.0/32")).toThrow(/outside/);
	});

	test("capacity reflects usable hosts", () => {
		const a = new IpAllocator("10.42.0.0/16");
		// 65536 - 2 (net + broadcast) - 1 (gateway) = 65533
		expect(a.capacity).toBe(65533);
	});
});
