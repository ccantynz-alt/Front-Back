import { describe, expect, test } from "bun:test";
import {
	generateKeyPair,
	generateKeyPairFromSeed,
	isValidWgKey,
} from "./keys";

describe("keys", () => {
	test("generateKeyPair returns 32-byte base64 keys", () => {
		const kp = generateKeyPair();
		expect(isValidWgKey(kp.publicKey)).toBe(true);
		expect(isValidWgKey(kp.privateKey)).toBe(true);
		expect(Buffer.from(kp.publicKey, "base64").length).toBe(32);
		expect(Buffer.from(kp.privateKey, "base64").length).toBe(32);
	});

	test("generateKeyPair never produces duplicates across many calls", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const kp = generateKeyPair();
			expect(seen.has(kp.privateKey)).toBe(false);
			seen.add(kp.privateKey);
		}
	});

	test("generateKeyPairFromSeed is deterministic for the same seed", () => {
		const seed = new Uint8Array(32);
		for (let i = 0; i < 32; i++) seed[i] = i;
		const a = generateKeyPairFromSeed(seed);
		const b = generateKeyPairFromSeed(seed);
		expect(a.privateKey).toBe(b.privateKey);
		expect(a.publicKey).toBe(b.publicKey);
	});

	test("generateKeyPairFromSeed produces different keys for different seeds", () => {
		const s1 = new Uint8Array(32);
		const s2 = new Uint8Array(32);
		// Pick a seed byte clamping won't mask away — byte index 1 is untouched
		// by the RFC 7748 clamping, which only modifies bytes 0 and 31.
		s2[1] = 0xaa;
		const a = generateKeyPairFromSeed(s1);
		const b = generateKeyPairFromSeed(s2);
		expect(a.privateKey).not.toBe(b.privateKey);
		expect(a.publicKey).not.toBe(b.publicKey);
	});

	test("generateKeyPairFromSeed clamps per RFC 7748", () => {
		// All-ones seed: private key after clamping should have first byte
		// `0xff & 248 = 0xf8` and last byte `(0xff & 127) | 64 = 0x7f`.
		const seed = new Uint8Array(32);
		seed.fill(0xff);
		const kp = generateKeyPairFromSeed(seed);
		const priv = Buffer.from(kp.privateKey, "base64");
		expect(priv[0]).toBe(0xf8);
		expect(priv[31]).toBe(0x7f);
	});

	test("generateKeyPairFromSeed rejects bad seed length", () => {
		expect(() => generateKeyPairFromSeed(new Uint8Array(16))).toThrow();
	});

	test("isValidWgKey rejects garbage", () => {
		expect(isValidWgKey("not base64!!!")).toBe(false);
		expect(isValidWgKey("AAAA")).toBe(false); // 3 bytes
		expect(isValidWgKey("")).toBe(false);
	});
});
