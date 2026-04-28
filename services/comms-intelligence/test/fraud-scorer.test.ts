import { describe, expect, it } from "bun:test";
import {
  type FraudInput,
  heuristicFraudScore,
  scoreFraud,
} from "../src/fraud-scorer";
import { StubLlmClient } from "../src/llm-client";

const NOW = new Date("2026-04-28T12:00:00Z");

function attempt(minutesAgo: number, outcome: "success" | "failure" | "expired" | "blocked", ip?: string) {
  return {
    at: new Date(NOW.getTime() - minutesAgo * 60 * 1000).toISOString(),
    outcome,
    ...(ip !== undefined && { ipAddress: ip }),
  };
}

describe("heuristicFraudScore", () => {
  it("returns 0 score with no signals on a clean legit request", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0 (iPhone)",
      countryCode: "US",
      recentAttempts: [attempt(120, "success", "8.8.8.8")],
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.score).toBe(0);
    expect(out.signals).toEqual([]);
  });

  it("flags VELOCITY_EXTREME for 5+ attempts in 5 minutes", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
      recentAttempts: [
        attempt(1, "failure"),
        attempt(2, "failure"),
        attempt(3, "failure"),
        attempt(4, "failure"),
        attempt(4.5, "failure"),
      ],
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("VELOCITY_EXTREME");
    expect(out.signals).toContain("REPEATED_FAILURE");
    expect(out.score).toBeGreaterThanOrEqual(50);
  });

  it("flags VELOCITY_HIGH for 3 attempts in 5 minutes", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
      recentAttempts: [attempt(1, "success"), attempt(2, "success"), attempt(3, "success")],
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("VELOCITY_HIGH");
  });

  it("flags PREMIUM_RATE_PREFIX with high score for premium dial-back", () => {
    const input: FraudInput = {
      identifier: "+19005550100",
      channel: "voice",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("PREMIUM_RATE_PREFIX");
    expect(out.score).toBeGreaterThanOrEqual(40);
  });

  it("flags DISPOSABLE_NUMBER_RANGE for known VoIP prefixes", () => {
    const input: FraudInput = {
      identifier: "+12675550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("DISPOSABLE_NUMBER_RANGE");
  });

  it("flags KNOWN_BAD_IP for Tor exit nodes", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "185.220.101.1",
      userAgent: "Mozilla/5.0",
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("KNOWN_BAD_IP");
  });

  it("flags BURNER_USER_AGENT for curl/python-requests", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "curl/8.0.1",
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("BURNER_USER_AGENT");
  });

  it("flags MISSING_METADATA when ipAddress and userAgent are absent", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("MISSING_METADATA");
  });

  it("flags GEO_ANOMALY when current IP differs from prior /16", () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
      recentAttempts: [attempt(10, "success", "203.0.113.1")],
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.signals).toContain("GEO_ANOMALY");
  });

  it("clamps score at 100", () => {
    const input: FraudInput = {
      identifier: "+19005550100",
      channel: "voice",
      ipAddress: "185.220.101.1",
      userAgent: "curl/8.0.1",
      recentAttempts: [
        attempt(1, "failure", "10.0.0.1"),
        attempt(2, "failure", "10.0.0.1"),
        attempt(3, "failure", "10.0.0.1"),
        attempt(4, "failure", "10.0.0.1"),
        attempt(4.5, "failure", "10.0.0.1"),
      ],
    };
    const out = heuristicFraudScore(input, NOW);
    expect(out.score).toBe(100);
  });
});

describe("scoreFraud (with LLM second opinion)", () => {
  it("returns allow decision for clean input without LLM", async () => {
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
    };
    const out = await scoreFraud(input, { now: NOW });
    expect(out.decision).toBe("allow");
    expect(out.score).toBeLessThan(35);
  });

  it("returns block decision when score >= 70", async () => {
    const input: FraudInput = {
      identifier: "+19005550100",
      channel: "voice",
      ipAddress: "185.220.101.1",
      userAgent: "curl/8.0.1",
    };
    const out = await scoreFraud(input, { now: NOW });
    expect(out.decision).toBe("block");
  });

  it("returns challenge decision when score is in middle band", async () => {
    const input: FraudInput = {
      identifier: "+12675550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "curl/8.0.1",
    };
    const out = await scoreFraud(input, { now: NOW });
    expect(out.decision).toBe("challenge");
  });

  it("escalates to block when LLM flags it", async () => {
    const llm = new StubLlmClient({
      responses: { "fraud-score": "VERDICT: block" },
    });
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
    };
    const out = await scoreFraud(input, { llm, now: NOW });
    expect(out.signals).toContain("LLM_FLAGGED");
    expect(out.score).toBeGreaterThanOrEqual(80);
    expect(out.decision).toBe("block");
  });

  it("falls back to heuristic when LLM throws", async () => {
    const failing = {
      complete: () => Promise.reject(new Error("network")),
    };
    const input: FraudInput = {
      identifier: "+12025550100",
      channel: "sms",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
    };
    const out = await scoreFraud(input, { llm: failing, now: NOW });
    expect(out.decision).toBe("allow");
  });

  it("provides reasoning string", async () => {
    const input: FraudInput = {
      identifier: "+19005550100",
      channel: "voice",
      ipAddress: "8.8.8.8",
      userAgent: "Mozilla/5.0",
    };
    const out = await scoreFraud(input, { now: NOW });
    expect(out.reasoning).toContain("PREMIUM_RATE_PREFIX");
  });
});
