import { describe, expect, it } from "bun:test";
import { clipContent, redact, sanitize } from "./redact";

describe("redact", () => {
  it("strips anthropic keys", () => {
    const input = "use key sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890 please";
    expect(redact(input)).toContain("[REDACTED:ANTHROPIC_KEY]");
    expect(redact(input)).not.toContain("sk-ant-api03-abc");
  });

  it("strips stripe secrets", () => {
    const fake = ["sk", "live", "51HxYzAbcDefGhIjKlMnOpQrSt"].join("_");
    const input = `STRIPE_SECRET_KEY=${fake}`;
    expect(redact(input)).toContain("[REDACTED:STRIPE_SECRET]");
  });

  it("strips crontech api keys", () => {
    const input = "btf_sk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(redact(input)).toContain("[REDACTED:CRONTECH_API_KEY]");
  });

  it("preserves ordinary text", () => {
    const input = "This is just an ordinary sentence with no secrets.";
    expect(redact(input)).toBe(input);
  });

  it("handles empty input", () => {
    expect(redact("")).toBe("");
  });
});

describe("clipContent", () => {
  it("passes short content through untouched", () => {
    expect(clipContent("hello world")).toBe("hello world");
  });

  it("clips oversized content", () => {
    const big = "x".repeat(70_000);
    const out = clipContent(big);
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain("chars clipped");
  });
});

describe("sanitize", () => {
  it("redacts AND clips", () => {
    const fake = ["sk", "live", "51HxYzAbcDefGhIjKlMnOpQrSt"].join("_");
    const input = `${"x".repeat(70_000)} ${fake}`;
    const out = sanitize(input);
    // The secret got clipped off; what remains has no secret.
    expect(out).not.toContain("51HxYz");
    expect(out).toContain("chars clipped");
  });
});
