import { describe, expect, test } from "bun:test";
import { bootInProcess, readConfigFromEnv } from "./index.ts";

describe("readConfigFromEnv", () => {
  test("throws when EMAIL_SEND_TOKEN missing", () => {
    expect(() => readConfigFromEnv({})).toThrow();
  });
  test("returns config with defaults", () => {
    const cfg = readConfigFromEnv({ EMAIL_SEND_TOKEN: "t" });
    expect(cfg.bearerToken).toBe("t");
    expect(cfg.restPort).toBeGreaterThan(0);
    expect(cfg.hostname.length).toBeGreaterThan(0);
  });
  test("rejects invalid port", () => {
    expect(() => readConfigFromEnv({ EMAIL_SEND_TOKEN: "t", EMAIL_SEND_REST_PORT: "abc" })).toThrow();
  });
});

describe("bootInProcess", () => {
  test("constructs the full service graph", () => {
    const svc = bootInProcess({
      bearerToken: "t",
      domainServiceUrl: "http://nope",
      restPort: 8787,
      hostname: "test",
    });
    expect(svc.pipeline).toBeDefined();
    expect(svc.store).toBeDefined();
    expect(svc.rest).toBeDefined();
    expect(svc.queue.size()).toBe(0);
    expect(svc.suppression.size()).toBe(0);
    expect(svc.webhooks.get("missing")).toBeUndefined();
  });
});
