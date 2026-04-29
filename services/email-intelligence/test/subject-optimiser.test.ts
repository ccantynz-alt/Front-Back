import { describe, expect, test } from "bun:test";
import { StubLlmClient } from "../src/llm-client";
import { optimiseSubject, predictOpenRate } from "../src/subject-optimiser";

describe("predictOpenRate", () => {
  test("ideal length + question + numeral scores above baseline", () => {
    const { predicted, confidenceInterval, rationale } = predictOpenRate(
      "Your 5 best deploy tips for Q2?",
    );
    expect(predicted).toBeGreaterThan(0.21);
    expect(confidenceInterval[0]).toBeLessThan(predicted);
    expect(confidenceInterval[1]).toBeGreaterThan(predicted);
    expect(rationale.length).toBeGreaterThan(0);
  });

  test("ALL-CAPS lowers predicted open rate", () => {
    const noisy = predictOpenRate("CHECK THIS OUT IT IS GREAT").predicted;
    const clean = predictOpenRate("Check this out — quick win for Tuesday").predicted;
    expect(clean).toBeGreaterThan(noisy);
  });

  test("over-long subjects penalised", () => {
    const long = predictOpenRate(
      "this is a really really really really really really long subject that nobody will read",
    ).predicted;
    expect(long).toBeLessThan(0.21);
  });
});

describe("optimiseSubject — rule-based", () => {
  test("returns original + multiple variants ranked by predicted open rate", async () => {
    const { variants } = await optimiseSubject({
      subject: "Update on your account",
    });
    expect(variants.length).toBeGreaterThan(1);
    expect(variants[0]?.predictedOpenRate).toBeGreaterThanOrEqual(
      variants[variants.length - 1]?.predictedOpenRate ?? 0,
    );
    expect(variants.some((v) => v.source === "input")).toBe(true);
    expect(variants.some((v) => v.source === "rule")).toBe(true);
  });

  test("personalisation rule fires when missing", async () => {
    const { variants } = await optimiseSubject({ subject: "Welcome aboard" });
    expect(
      variants.some((v) => /\{\{?firstName\}?\}/.test(v.subject)),
    ).toBe(true);
  });

  test("audience.industry steers numeric variant", async () => {
    const { variants } = await optimiseSubject({
      subject: "tips for you",
      audience: { industry: "fintech" },
    });
    expect(variants.some((v) => /fintech/.test(v.subject))).toBe(true);
  });

  test("respects maxVariants", async () => {
    const { variants } = await optimiseSubject(
      { subject: "Welcome aboard" },
      { maxVariants: 3 },
    );
    expect(variants.length).toBeLessThanOrEqual(3);
  });
});

describe("optimiseSubject — LLM path", () => {
  test("LLM variants are included and tagged", async () => {
    const stub = new StubLlmClient({
      responses: {
        "subject-variants": "Try our new dashboard\nQuick win: 2-min setup",
      },
    });
    const { variants } = await optimiseSubject(
      { subject: "Check us out" },
      { llm: stub },
    );
    expect(variants.some((v) => v.source === "llm")).toBe(true);
    expect(stub.callLog[0]?.purpose).toBe("subject-variants");
  });

  test("LLM failure does not break the call", async () => {
    const failing: import("../src/llm-client").LlmClient = {
      async complete() {
        throw new Error("upstream down");
      },
    };
    const { variants } = await optimiseSubject(
      { subject: "Welcome aboard" },
      { llm: failing },
    );
    expect(variants.length).toBeGreaterThan(0);
  });
});
