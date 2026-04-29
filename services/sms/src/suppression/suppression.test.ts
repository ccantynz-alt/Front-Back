import { describe, expect, it } from "bun:test";
import { SuppressionList, detectStopKeyword } from "./suppression-list.ts";

describe("SuppressionList", () => {
  it("adds and detects suppressed numbers", () => {
    const list = new SuppressionList();
    list.add("t1", "+15550001111", "STOP");
    expect(list.isSuppressed("t1", "+15550001111")).toBe(true);
    expect(list.isSuppressed("t2", "+15550001111")).toBe(false);
  });

  it("removes suppressions", () => {
    const list = new SuppressionList();
    list.add("t1", "+15550001111");
    expect(list.remove("t1", "+15550001111")).toBe(true);
    expect(list.isSuppressed("t1", "+15550001111")).toBe(false);
  });

  it("lists suppressed numbers per tenant", () => {
    const list = new SuppressionList();
    list.add("t1", "+15550001111");
    list.add("t1", "+15550002222");
    list.add("t2", "+15550003333");
    expect(list.list("t1").sort()).toEqual(["+15550001111", "+15550002222"]);
    expect(list.list("t2")).toEqual(["+15550003333"]);
  });
});

describe("detectStopKeyword", () => {
  it("matches canonical STOP variants", () => {
    expect(detectStopKeyword("STOP")).toBe("STOP");
    expect(detectStopKeyword("stop")).toBe("STOP");
    expect(detectStopKeyword(" Stop! ")).toBe("STOP");
    expect(detectStopKeyword("UNSUBSCRIBE")).toBe("UNSUBSCRIBE");
    expect(detectStopKeyword("cancel.")).toBe("CANCEL");
    expect(detectStopKeyword("end")).toBe("END");
    expect(detectStopKeyword("OPTOUT")).toBe("OPTOUT");
  });

  it("returns null for non-keywords", () => {
    expect(detectStopKeyword("hello")).toBe(null);
    expect(detectStopKeyword("")).toBe(null);
    expect(detectStopKeyword("stop calling me")).toBe(null);
  });
});
