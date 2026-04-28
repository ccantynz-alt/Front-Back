import { describe, expect, test } from "bun:test";
import { generateHostname, prId } from "../src/hostname";

describe("generateHostname", () => {
  const baseInput = {
    owner: "crontech",
    repo: "back-to-the-future",
    number: 42,
    sha: "abcdef1234567890",
    previewDomain: "preview.crontech.dev",
  };

  test("produces deterministic hostname for given inputs", () => {
    const a = generateHostname(baseInput);
    const b = generateHostname(baseInput);
    expect(a).toBe(b);
    expect(a).toBe(
      "crontech-back-to-the-future-pr42-abcdef1.preview.crontech.dev",
    );
  });

  test("lowercases and sanitises owner/repo", () => {
    const out = generateHostname({
      ...baseInput,
      owner: "Cron_Tech",
      repo: "Back.To.The.Future!",
    });
    expect(out).toMatch(
      /^cron-tech-back-to-the-future-pr42-abcdef1\.preview\.crontech\.dev$/,
    );
  });

  test("rejects invalid PR numbers", () => {
    expect(() => generateHostname({ ...baseInput, number: 0 })).toThrow();
    expect(() => generateHostname({ ...baseInput, number: -1 })).toThrow();
    expect(() => generateHostname({ ...baseInput, number: 1.5 })).toThrow();
  });

  test("rejects short or non-hex SHAs", () => {
    expect(() => generateHostname({ ...baseInput, sha: "abc" })).toThrow();
    expect(() =>
      generateHostname({ ...baseInput, sha: "zzzzzzzzzzz" }),
    ).toThrow(/hex/);
  });

  test("rejects empty owner/repo after sanitisation", () => {
    expect(() => generateHostname({ ...baseInput, owner: "!!!" })).toThrow();
    expect(() => generateHostname({ ...baseInput, repo: "..." })).toThrow();
  });

  test("truncates long owner/repo to fit DNS 63-char limit", () => {
    const longOwner = "a".repeat(80);
    const longRepo = "b".repeat(80);
    const out = generateHostname({
      ...baseInput,
      owner: longOwner,
      repo: longRepo,
    });
    const label = out.split(".")[0]!;
    expect(label.length).toBeLessThanOrEqual(63);
    expect(label).toMatch(/-pr42-abcdef1$/);
  });

  test("changes when SHA changes (different PR commit)", () => {
    const a = generateHostname(baseInput);
    const b = generateHostname({ ...baseInput, sha: "ffffffe1234567890" });
    expect(a).not.toBe(b);
  });
});

describe("prId", () => {
  test("produces stable form", () => {
    expect(prId("crontech", "btf", 7)).toBe("crontech/btf#7");
  });
});
