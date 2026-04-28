import { describe, expect, it } from "bun:test";
import {
	negotiateFormat,
	outputFormatToMime,
} from "../src/format-negotiation.ts";
import { parseTransformParams } from "../src/params.ts";

describe("negotiateFormat", () => {
	const baseParams = parseTransformParams({
		src: "https://cdn.example.com/a.png",
	});

	it("respects explicit fmt param above all else", () => {
		const params = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			fmt: "png",
		});
		expect(negotiateFormat(params, "image/avif", "image/jpeg")).toBe("png");
	});

	it("prefers avif when client accepts it", () => {
		expect(
			negotiateFormat(baseParams, "image/avif,image/webp,*/*", "image/png"),
		).toBe("avif");
	});

	it("falls back to webp when avif not accepted", () => {
		expect(
			negotiateFormat(baseParams, "image/webp,image/jpeg", "image/png"),
		).toBe("webp");
	});

	it("falls back to jpeg when only legacy formats accepted", () => {
		expect(negotiateFormat(baseParams, "image/jpeg", "image/png")).toBe(
			"jpeg",
		);
	});

	it("treats wildcard accept as 'use best modern format'", () => {
		expect(negotiateFormat(baseParams, "*/*", "image/png")).toBe("avif");
		expect(negotiateFormat(baseParams, "image/*", "image/png")).toBe("avif");
	});

	it("falls back to source content-type if accept gives no match", () => {
		expect(negotiateFormat(baseParams, "text/html", "image/png")).toBe("png");
	});

	it("falls back to webp when nothing matches", () => {
		expect(negotiateFormat(baseParams, null, null)).toBe("webp");
		expect(negotiateFormat(baseParams, "text/html", "application/octet-stream")).toBe(
			"webp",
		);
	});

	it("strips q-values from accept entries", () => {
		expect(
			negotiateFormat(baseParams, "image/webp;q=0.9,image/avif;q=0.5", "image/png"),
		).toBe("avif");
	});

	it("normalises image/jpg → jpeg", () => {
		expect(negotiateFormat(baseParams, "text/html", "image/jpg")).toBe("jpeg");
	});
});

describe("outputFormatToMime", () => {
	it("maps each output format to its mime", () => {
		expect(outputFormatToMime("webp")).toBe("image/webp");
		expect(outputFormatToMime("avif")).toBe("image/avif");
		expect(outputFormatToMime("jpeg")).toBe("image/jpeg");
		expect(outputFormatToMime("png")).toBe("image/png");
	});
});
