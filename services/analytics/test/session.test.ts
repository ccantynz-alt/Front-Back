import { describe, expect, it } from "bun:test";
import { DailySaltStore, deriveSessionId } from "../src/collector/session";

const FIXED = Buffer.from("0".repeat(64), "hex");

describe("DailySaltStore", () => {
  it("returns the same salt within a UTC day", () => {
    let calls = 0;
    const s = new DailySaltStore({
      randomSource: () => {
        calls++;
        return Buffer.from(`${calls}`.padStart(64, "0"), "hex");
      },
      now: () => 1_000,
    });
    const a = s.currentSalt(1_000);
    const b = s.currentSalt(60_000_000);
    expect(a.equals(b)).toBe(true);
  });

  it("rotates the salt at the day boundary", () => {
    let calls = 0;
    const s = new DailySaltStore({
      randomSource: () => {
        calls++;
        return Buffer.from(`${calls}`.padStart(64, "0"), "hex");
      },
      now: () => 0,
    });
    const day0 = s.currentSalt(0);
    const day1 = s.currentSalt(24 * 60 * 60 * 1000 + 1);
    expect(day0.equals(day1)).toBe(false);
  });

  it("derives a deterministic session id given fixed inputs", () => {
    const sid1 = deriveSessionId(FIXED, "1.2.3.4", "Mozilla/5.0");
    const sid2 = deriveSessionId(FIXED, "1.2.3.4", "Mozilla/5.0");
    expect(sid1).toBe(sid2);
    expect(sid1).toHaveLength(16);
  });

  it("changes session id when salt rotates", () => {
    const sid1 = deriveSessionId(FIXED, "1.2.3.4", "ua");
    const otherSalt = Buffer.from("1".repeat(64), "hex");
    const sid2 = deriveSessionId(otherSalt, "1.2.3.4", "ua");
    expect(sid1).not.toBe(sid2);
  });

  it("changes session id when ip changes", () => {
    const sid1 = deriveSessionId(FIXED, "1.2.3.4", "ua");
    const sid2 = deriveSessionId(FIXED, "5.6.7.8", "ua");
    expect(sid1).not.toBe(sid2);
  });

  it("changes session id when ua changes", () => {
    const sid1 = deriveSessionId(FIXED, "1.2.3.4", "ua-a");
    const sid2 = deriveSessionId(FIXED, "1.2.3.4", "ua-b");
    expect(sid1).not.toBe(sid2);
  });
});
