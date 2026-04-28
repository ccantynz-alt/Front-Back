/**
 * OWASP default rule pack — fires on known-bad input, lets benign payloads
 * through. Negative cases are as load-bearing as positive ones; without them
 * the patterns drift to false-positive fests.
 */
import { describe, expect, it } from "bun:test";
import {
  RateLimiter,
  WafEngine,
  InMemoryRuleStore,
} from "../src/index";
import type { RequestContext } from "../src/types";

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  tenantId: "t1",
  method: "GET",
  pathname: "/api/things",
  ip: "1.2.3.4",
  userAgent: "Mozilla/5.0",
  authenticated: false,
  query: "",
  ...over,
});

const makeEngine = (): WafEngine => new WafEngine(new InMemoryRuleStore(), new RateLimiter());

describe("OWASP default pack", () => {
  it("denies SQL injection in query string", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ query: "?id=1 UNION SELECT password FROM users" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("owasp-sqli");
  });

  it("denies SQL injection in body", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ body: "name='; DROP TABLE users; --" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("owasp-sqli");
  });

  it("denies XSS attempts", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ body: "<script>document.cookie</script>" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("owasp-xss");
  });

  it("denies onerror payloads", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ body: '<img src=x onerror="alert(1)">' }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("owasp-xss");
  });

  it("denies path traversal in path", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ pathname: "/files/../../etc/passwd" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("owasp-traversal");
  });

  it("denies encoded path traversal", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ query: "?file=%2e%2e%2fetc/passwd" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("owasp-traversal");
  });

  it("denies sqlmap user agent immediately", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ userAgent: "sqlmap/1.6.5" }));
    expect(out.decision).toBe("deny");
    expect(out.reason).toBe("scanner-ua");
  });

  it("denies nikto, zgrab, masscan", () => {
    const engine = makeEngine();
    for (const ua of ["Nikto/2.5", "zgrab/0.x", "masscan/1.0"]) {
      const out = engine.evaluate(ctx({ userAgent: ua }));
      expect(out.decision).toBe("deny");
      expect(out.reason).toBe("scanner-ua");
    }
  });

  it("does not deny benign queries", () => {
    const engine = makeEngine();
    const out = engine.evaluate(ctx({ query: "?name=alice&page=2" }));
    expect(out.decision).toBe("allow");
    expect(out.reason).toBe("default-allow");
  });

  it("does not deny normal SQL-ish words in content", () => {
    const engine = makeEngine();
    // benign — no SQL syntax, no scanner UA
    const out = engine.evaluate(ctx({ body: "I love selecting from the menu" }));
    expect(out.decision).toBe("allow");
  });
});
