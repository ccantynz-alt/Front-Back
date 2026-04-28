import { describe, expect, test } from "bun:test";
import { classifySmtpCode, nextDelay } from "./retry-policy.ts";

describe("classifySmtpCode", () => {
  test("2xx → delivered", () => {
    expect(classifySmtpCode(250)).toBe("delivered");
    expect(classifySmtpCode(200)).toBe("delivered");
  });
  test("4xx → retry", () => {
    expect(classifySmtpCode(421)).toBe("retry");
    expect(classifySmtpCode(450)).toBe("retry");
    expect(classifySmtpCode(499)).toBe("retry");
  });
  test("5xx → hard-bounce", () => {
    expect(classifySmtpCode(550)).toBe("hard-bounce");
    expect(classifySmtpCode(554)).toBe("hard-bounce");
  });
});

describe("nextDelay", () => {
  test("returns increasing delays", () => {
    const a = nextDelay(0);
    const b = nextDelay(1);
    const c = nextDelay(2);
    expect(a.give_up).toBe(false);
    expect(b.delayMs).toBeGreaterThan(a.delayMs);
    expect(c.delayMs).toBeGreaterThan(b.delayMs);
  });
  test("eventually gives up", () => {
    const last = nextDelay(99);
    expect(last.give_up).toBe(true);
  });
});
