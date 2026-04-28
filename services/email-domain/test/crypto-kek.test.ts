import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptPrivateKey, encryptPrivateKey, loadMasterKek } from "../src/crypto/kek.ts";

describe("crypto/kek", () => {
	test("round-trips plaintext", () => {
		const kek = randomBytes(32);
		const plaintext = Buffer.from("super-secret-private-key-pem");
		const ct = encryptPrivateKey({ plaintext, kek, tenantId: "t1", domainId: "d1" });
		const out = decryptPrivateKey({ ciphertextB64: ct, kek, tenantId: "t1", domainId: "d1" });
		expect(out.equals(plaintext)).toBe(true);
	});

	test("rejects cross-tenant decryption (AAD binding)", () => {
		const kek = randomBytes(32);
		const ct = encryptPrivateKey({
			plaintext: Buffer.from("payload"),
			kek,
			tenantId: "tenant-A",
			domainId: "d1",
		});
		expect(() =>
			decryptPrivateKey({ ciphertextB64: ct, kek, tenantId: "tenant-B", domainId: "d1" }),
		).toThrow();
	});

	test("rejects wrong domainId in AAD", () => {
		const kek = randomBytes(32);
		const ct = encryptPrivateKey({
			plaintext: Buffer.from("payload"),
			kek,
			tenantId: "t1",
			domainId: "d1",
		});
		expect(() =>
			decryptPrivateKey({ ciphertextB64: ct, kek, tenantId: "t1", domainId: "d2" }),
		).toThrow();
	});

	test("two ciphertexts of same plaintext are different (random nonce)", () => {
		const kek = randomBytes(32);
		const a = encryptPrivateKey({ plaintext: Buffer.from("x"), kek, tenantId: "t", domainId: "d" });
		const b = encryptPrivateKey({ plaintext: Buffer.from("x"), kek, tenantId: "t", domainId: "d" });
		expect(a).not.toBe(b);
	});

	test("loadMasterKek validates length", () => {
		expect(() => loadMasterKek({ EMAIL_DOMAIN_MASTER_KEK: "" })).toThrow();
		expect(() =>
			loadMasterKek({ EMAIL_DOMAIN_MASTER_KEK: Buffer.from("short").toString("base64") }),
		).toThrow();
		const good = randomBytes(32).toString("base64");
		expect(loadMasterKek({ EMAIL_DOMAIN_MASTER_KEK: good }).length).toBe(32);
	});
});
