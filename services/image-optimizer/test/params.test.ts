import { describe, expect, it } from "bun:test";
import { canonicalize, parseTransformParams } from "../src/params.ts";
import { OptimizerError } from "../src/types.ts";

describe("parseTransformParams", () => {
	it("parses a minimal request", () => {
		const params = parseTransformParams({ src: "https://cdn.example.com/a.png" });
		expect(params.src).toBe("https://cdn.example.com/a.png");
		expect(params.quality).toBe(80);
		expect(params.fit).toBe("cover");
		expect(params.blur).toBe(0);
		expect(params.dpr).toBe(1);
		expect(params.width).toBeUndefined();
		expect(params.height).toBeUndefined();
		expect(params.format).toBeUndefined();
	});

	it("parses a full request with all params", () => {
		const params = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "400",
			h: "300",
			q: "75",
			fmt: "avif",
			fit: "contain",
			blur: "5",
			dpr: "2",
		});
		expect(params.width).toBe(800);
		expect(params.height).toBe(600);
		expect(params.quality).toBe(75);
		expect(params.format).toBe("avif");
		expect(params.fit).toBe("contain");
		expect(params.blur).toBe(5);
		expect(params.dpr).toBe(2);
	});

	it("applies DPR multiplier to dimensions", () => {
		const params = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "500",
			dpr: "3",
		});
		expect(params.width).toBe(1500);
	});

	it("clamps DPR-multiplied dimensions to the hard cap", () => {
		const params = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "5000",
			dpr: "3",
		});
		// 5000 * 3 = 15000, clamped to 8000
		expect(params.width).toBe(8000);
	});

	it("rejects non-URL src", () => {
		expect(() => parseTransformParams({ src: "not a url" })).toThrow(OptimizerError);
	});

	it("rejects ftp:// src", () => {
		expect(() =>
			parseTransformParams({ src: "ftp://example.com/a.png" }),
		).toThrow(OptimizerError);
	});

	it("rejects width over 8000", () => {
		expect(() =>
			parseTransformParams({ src: "https://cdn.example.com/a.png", w: "9000" }),
		).toThrow(OptimizerError);
	});

	it("rejects quality over 100", () => {
		expect(() =>
			parseTransformParams({ src: "https://cdn.example.com/a.png", q: "101" }),
		).toThrow(OptimizerError);
	});

	it("rejects blur over 100", () => {
		expect(() =>
			parseTransformParams({
				src: "https://cdn.example.com/a.png",
				blur: "101",
			}),
		).toThrow(OptimizerError);
	});

	it("rejects unknown format", () => {
		expect(() =>
			parseTransformParams({
				src: "https://cdn.example.com/a.png",
				fmt: "bmp",
			}),
		).toThrow(OptimizerError);
	});

	it("rejects negative width", () => {
		expect(() =>
			parseTransformParams({ src: "https://cdn.example.com/a.png", w: "-5" }),
		).toThrow(OptimizerError);
	});
});

describe("canonicalize", () => {
	it("produces stable output regardless of insertion order", () => {
		const a = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "200",
			h: "100",
			q: "80",
		});
		const b = parseTransformParams({
			h: "100",
			q: "80",
			src: "https://cdn.example.com/a.png",
			w: "200",
		});
		expect(canonicalize(a)).toBe(canonicalize(b));
	});

	it("differs when any param differs", () => {
		const a = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "200",
		});
		const b = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "201",
		});
		expect(canonicalize(a)).not.toBe(canonicalize(b));
	});

	it("treats absent and present params as different cache keys", () => {
		const a = parseTransformParams({ src: "https://cdn.example.com/a.png" });
		const b = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "200",
		});
		expect(canonicalize(a)).not.toBe(canonicalize(b));
	});
});
