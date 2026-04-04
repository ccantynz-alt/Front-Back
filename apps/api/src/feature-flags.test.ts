import { describe, test, expect, beforeEach } from "bun:test";
import {
  defineFlag,
  getFlag,
  getAllFlags,
  updateFlag,
  deleteFlag,
  isFeatureEnabled,
} from "./feature-flags";

describe("Feature Flags", () => {
  beforeEach(() => {
    // Pre-defined flags already exist from module load
  });

  test("defineFlag creates a new flag", () => {
    const flag = defineFlag("test.flag", {
      enabled: true,
      description: "Test flag",
      rolloutPercentage: 50,
    });
    expect(flag.key).toBe("test.flag");
    expect(flag.enabled).toBe(true);
    expect(flag.rolloutPercentage).toBe(50);
  });

  test("getFlag retrieves an existing flag", () => {
    defineFlag("test.get", { enabled: true });
    const flag = getFlag("test.get");
    expect(flag).toBeDefined();
    expect(flag!.key).toBe("test.get");
  });

  test("getFlag returns undefined for non-existent flag", () => {
    expect(getFlag("nonexistent.flag")).toBeUndefined();
  });

  test("getAllFlags returns all defined flags", () => {
    const allFlags = getAllFlags();
    expect(allFlags.length).toBeGreaterThan(0);
    // Pre-defined flags should be present
    const keys = allFlags.map((f) => f.key);
    expect(keys).toContain("ai.client_inference");
    expect(keys).toContain("ai.generative_ui");
  });

  test("updateFlag modifies an existing flag", () => {
    defineFlag("test.update", { enabled: false });
    const updated = updateFlag("test.update", { enabled: true, rolloutPercentage: 75 });
    expect(updated).toBeDefined();
    expect(updated!.enabled).toBe(true);
    expect(updated!.rolloutPercentage).toBe(75);
  });

  test("updateFlag returns undefined for non-existent flag", () => {
    expect(updateFlag("nonexistent", { enabled: true })).toBeUndefined();
  });

  test("deleteFlag removes a flag", () => {
    defineFlag("test.delete", { enabled: true });
    expect(deleteFlag("test.delete")).toBe(true);
    expect(getFlag("test.delete")).toBeUndefined();
  });

  test("isFeatureEnabled returns false for non-existent flag", () => {
    expect(isFeatureEnabled("nonexistent")).toBe(false);
  });

  test("isFeatureEnabled returns false for disabled flag", () => {
    defineFlag("test.disabled", { enabled: false });
    expect(isFeatureEnabled("test.disabled")).toBe(false);
  });

  test("isFeatureEnabled returns true for enabled flag at 100%", () => {
    defineFlag("test.enabled", { enabled: true, rolloutPercentage: 100 });
    expect(isFeatureEnabled("test.enabled")).toBe(true);
  });

  test("isFeatureEnabled respects deny list", () => {
    defineFlag("test.deny", {
      enabled: true,
      rolloutPercentage: 100,
      denyList: ["user-blocked"],
    });
    expect(isFeatureEnabled("test.deny", "user-blocked")).toBe(false);
    expect(isFeatureEnabled("test.deny", "user-allowed")).toBe(true);
  });

  test("isFeatureEnabled respects allow list", () => {
    defineFlag("test.allow", {
      enabled: true,
      rolloutPercentage: 0,
      allowList: ["user-vip"],
    });
    expect(isFeatureEnabled("test.allow", "user-vip")).toBe(true);
    expect(isFeatureEnabled("test.allow", "user-normal")).toBe(false);
  });

  test("isFeatureEnabled deny list overrides allow list", () => {
    defineFlag("test.deny_over_allow", {
      enabled: true,
      rolloutPercentage: 100,
      allowList: ["user-both"],
      denyList: ["user-both"],
    });
    expect(isFeatureEnabled("test.deny_over_allow", "user-both")).toBe(false);
  });

  test("percentage rollout is deterministic for same user", () => {
    defineFlag("test.rollout", { enabled: true, rolloutPercentage: 50 });
    const result1 = isFeatureEnabled("test.rollout", "user-123");
    const result2 = isFeatureEnabled("test.rollout", "user-123");
    expect(result1).toBe(result2);
  });
});
