/**
 * Engine pipeline — order, IP allow/deny, bot detection, requireAuth, rate
 * limit selection. End-to-end through the public Outcome contract.
 */
import { describe, expect, it } from "bun:test";
import { WafEngine } from "../src/engine";
import { RateLimiter } from "../src/rate-limit";
import { allowRule, rateLimitRule, authRequiredRule } from "../src/rules";
import { InMemoryRuleStore } from "../src/store";
import type { RequestContext, Rule } from "../src/types";

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  tenantId: "t1",
  method: "GET",
  pathname: "/api/x",
  ip: "1.1.1.1",
  userAgent: "Mozilla/5.0",
  authenticated: false,
  query: "",
  ...over,
});

const denyAllRule = (tenantId: string): Rule => ({
  id: "deny-all",
  tenantId,
  pattern: ".*",
  methods: ["*"],
  ipDenylist: ["9.9.9.9"],
  priority: 100,
  createdAt: 0,
});

describe("WafEngine pipeline", () => {
  it("IP allowlist rule overrides denylist rule", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(denyAllRule("t1"));
    rules.upsert(allowRule("t1", "monitor", ".*", ["9.9.9.9"]));
    const engine = new WafEngine(rules, new RateLimiter());
    const out = engine.evaluate(ctx({ ip: "9.9.9.9" }));
    expect(out.decision).toBe("allow");
    expect(out.reason).toBe("ip-allowlist");
    expect(out.ruleId).toBe("monitor");
  });

  it("denies IPs in rule denylist", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(denyAllRule("t1"));
    const engine = new WafEngine(rules, new RateLimiter());
    const out = engine.evaluate(ctx({ ip: "9.9.9.9" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("ip-denylist");
  });

  it("returns auth-required when rule.requireAuth and not authenticated", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(authRequiredRule("t1", "auth-rule", "^/api"));
    const engine = new WafEngine(rules, new RateLimiter());
    const out = engine.evaluate(ctx({ authenticated: false }));
    expect(out.decision).toBe("auth-required");
    expect(out.ruleId).toBe("auth-rule");
  });

  it("allows authenticated requests on requireAuth routes", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(authRequiredRule("t1", "auth-rule", "^/api"));
    const engine = new WafEngine(rules, new RateLimiter());
    const out = engine.evaluate(ctx({ authenticated: true }));
    expect(out.decision).toBe("allow");
  });

  it("rate-limits per-IP after threshold", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(rateLimitRule("t1", "rl", "^/api", 2, 1000));
    const engine = new WafEngine(rules, new RateLimiter());
    expect(engine.evaluate(ctx({ now: 0 })).decision).toBe("allow");
    expect(engine.evaluate(ctx({ now: 1 })).decision).toBe("allow");
    const blocked = engine.evaluate(ctx({ now: 2 }));
    expect(blocked.decision).toBe("rate-limited");
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.ruleId).toBe("rl");
  });

  it("never rate-limits allowed bots (googlebot)", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(rateLimitRule("t1", "rl", ".*", 1, 1000));
    const engine = new WafEngine(rules, new RateLimiter());
    const ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    expect(engine.evaluate(ctx({ userAgent: ua, now: 0 })).decision).toBe("allow");
    // Second hit: rate-limited normally, but allowed bot bypasses.
    expect(engine.evaluate(ctx({ userAgent: ua, now: 1 })).decision).toBe("allow");
  });

  it("tags generic bot UA with bot-ua reason", () => {
    const engine = new WafEngine(new InMemoryRuleStore(), new RateLimiter());
    const out = engine.evaluate(ctx({ userAgent: "RandomCrawlerBot/1.0" }));
    expect(out.decision).toBe("allow");
    expect(out.reason).toBe("bot-ua");
  });

  it("denies on body deny patterns from rule", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert({
      id: "no-secrets",
      tenantId: "t1",
      pattern: ".*",
      methods: ["*"],
      bodyDenyPatterns: ["secret_token=[a-z0-9]+"],
      priority: 50,
      createdAt: 0,
    });
    const engine = new WafEngine(rules, new RateLimiter());
    const out = engine.evaluate(ctx({ body: "secret_token=abc123" }));
    expect(out.decision).toBe("deny");
    expect(out.ruleId).toBe("no-secrets");
  });

  it("global allow IPs short-circuit", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert(denyAllRule("t1"));
    const engine = new WafEngine(rules, new RateLimiter(), {
      globalAllowIps: ["10.0.0.1"],
    });
    const out = engine.evaluate(ctx({ ip: "10.0.0.1" }));
    expect(out.decision).toBe("allow");
    expect(out.reason).toBe("ip-allowlist");
  });

  it("respects method restrictions", () => {
    const rules = new InMemoryRuleStore();
    rules.upsert({
      id: "get-only",
      tenantId: "t1",
      pattern: "^/api/readonly",
      methods: ["GET"],
      priority: 50,
      createdAt: 0,
    });
    const engine = new WafEngine(rules, new RateLimiter());
    const out = engine.evaluate(ctx({ method: "POST", pathname: "/api/readonly" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("method-not-allowed");
  });
});
