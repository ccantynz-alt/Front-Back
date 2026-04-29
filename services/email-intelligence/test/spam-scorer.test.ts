import { describe, expect, test } from "bun:test";
import { heuristicSpamScore, scoreSpam } from "../src/spam-scorer";
import { StubLlmClient } from "../src/llm-client";

describe("heuristicSpamScore — canonical ham", () => {
  test("plain transactional email scores low", () => {
    const { score, signals } = heuristicSpamScore({
      subject: "Your invoice for April 2026",
      text: "Hi Alex, please find your invoice attached. Total: $42.00. Thanks!",
      html: "<p>Hi Alex, please find your invoice attached. Total: $42.00. Thanks!</p>",
      fromDomain: "billing.acme.com",
      headers: { "list-unsubscribe": "<mailto:unsub@acme.com>" },
    });
    expect(score).toBeLessThan(20);
    expect(signals.every((s) => !s.code.startsWith("subject."))).toBe(true);
  });
});

describe("heuristicSpamScore — canonical spam", () => {
  test("classic high-pressure spam scores high", () => {
    const { score, signals } = heuristicSpamScore({
      subject: "ACT NOW!!! YOU HAVE BEEN SELECTED — 100% FREE",
      html: '<a href="x">click here now</a><a href="y">click here now</a><a href="z">click here now</a>',
      fromDomain: "winner.zip",
      headers: {},
      fromDomainRegisteredAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    });
    expect(score).toBeGreaterThanOrEqual(60);
    const codes = signals.map((s) => s.code);
    expect(codes).toContain("subject.allcaps");
    expect(codes).toContain("subject.exclamation.density");
    expect(codes).toContain("subject.keywords");
    expect(codes).toContain("from.suspicious_tld");
    expect(codes).toContain("from.recent_registration");
  });

  test("hidden HTML is detected", () => {
    const { signals } = heuristicSpamScore({
      subject: "Update",
      html: '<div style="display:none">hidden tracker</div><p>hello</p>',
      text: "hello",
      fromDomain: "example.com",
    });
    expect(signals.map((s) => s.code)).toContain("body.hidden_html");
  });

  test("missing plain-text part is flagged", () => {
    const { signals } = heuristicSpamScore({
      subject: "Update",
      html: "<p>Hello world</p>",
      fromDomain: "example.com",
    });
    expect(signals.map((s) => s.code)).toContain("body.missing_text_part");
  });

  test("link-heavy body is flagged", () => {
    const html = Array.from({ length: 8 })
      .map((_, i) => `<a href="x${i}">l</a>`)
      .join(" word ");
    const { signals } = heuristicSpamScore({
      subject: "newsletter",
      html,
      text: html.replace(/<[^>]*>/g, ""),
      fromDomain: "example.com",
    });
    const codes = signals.map((s) => s.code);
    expect(
      codes.includes("body.link_ratio.high") ||
        codes.includes("body.link_ratio.medium") ||
        codes.includes("body.link_only"),
    ).toBe(true);
  });
});

describe("scoreSpam — verdict + LLM second opinion", () => {
  test("verdict pass for clean ham", async () => {
    const result = await scoreSpam({
      subject: "Welcome to Acme",
      text: "Thanks for signing up.",
      fromDomain: "acme.com",
      headers: { "list-unsubscribe": "<mailto:u@acme.com>" },
    });
    expect(result.verdict).toBe("pass");
    expect(result.llmScore).toBeUndefined();
  });

  test("LLM second opinion is recorded as a signal", async () => {
    const stub = new StubLlmClient({
      responses: { "spam-score": "85" },
    });
    const result = await scoreSpam(
      {
        subject: "hello",
        text: "hi",
        fromDomain: "acme.com",
      },
      { llm: stub },
    );
    expect(result.llmScore).toBe(85);
    expect(result.signals.some((s) => s.code === "llm.second_opinion")).toBe(true);
    expect(stub.callLog).toHaveLength(1);
    expect(stub.callLog[0]?.purpose).toBe("spam-score");
  });

  test("LLM disagrees high — verdict escalates", async () => {
    const stub = new StubLlmClient({ responses: { "spam-score": "92" } });
    const result = await scoreSpam(
      { subject: "hello", text: "hi", fromDomain: "acme.com" },
      { llm: stub },
    );
    expect(result.verdict).toBe("block");
  });

  test("malformed LLM reply degrades to undefined llmScore", async () => {
    const stub = new StubLlmClient({ responses: { "spam-score": "no number here" } });
    const result = await scoreSpam(
      { subject: "hello", fromDomain: "acme.com" },
      { llm: stub },
    );
    expect(result.llmScore).toBeUndefined();
  });
});
