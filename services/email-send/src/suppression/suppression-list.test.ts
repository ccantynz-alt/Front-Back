import { describe, expect, test } from "bun:test";
import { SuppressionList } from "./suppression-list.ts";

describe("SuppressionList", () => {
  test("add, isSuppressed, remove flow", () => {
    const list = new SuppressionList();
    expect(list.isSuppressed("t1", "user@x.com")).toBe(false);
    list.add("t1", "user@x.com", "hard-bounce");
    expect(list.isSuppressed("t1", "user@x.com")).toBe(true);
    expect(list.remove("t1", "user@x.com")).toBe(true);
    expect(list.isSuppressed("t1", "user@x.com")).toBe(false);
  });

  test("case-insensitive matching", () => {
    const list = new SuppressionList();
    list.add("t1", "User@X.com", "hard-bounce");
    expect(list.isSuppressed("t1", "user@x.com")).toBe(true);
    expect(list.isSuppressed("t1", "USER@X.COM")).toBe(true);
  });

  test("tenant isolation", () => {
    const list = new SuppressionList();
    list.add("t1", "a@x.com", "complaint");
    expect(list.isSuppressed("t1", "a@x.com")).toBe(true);
    expect(list.isSuppressed("t2", "a@x.com")).toBe(false);
  });

  test("list returns only entries for the tenant", () => {
    const list = new SuppressionList();
    list.add("t1", "a@x.com", "hard-bounce");
    list.add("t1", "b@x.com", "complaint");
    list.add("t2", "c@x.com", "manual");
    const t1 = list.list("t1");
    expect(t1.length).toBe(2);
    expect(t1.map((e) => e.address).sort()).toEqual(["a@x.com", "b@x.com"]);
  });
});
