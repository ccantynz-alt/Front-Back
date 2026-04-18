import { describe, expect, it } from "bun:test";
import { BuildKindSchema, RunStatusSchema, StepStatusSchema, LogStreamSchema } from "./types";

describe("theatre schemas", () => {
  it("validates run kinds", () => {
    expect(BuildKindSchema.parse("deploy")).toBe("deploy");
    expect(() => BuildKindSchema.parse("unknown")).toThrow();
  });

  it("validates run status", () => {
    expect(RunStatusSchema.parse("running")).toBe("running");
    expect(RunStatusSchema.parse("succeeded")).toBe("succeeded");
    expect(() => RunStatusSchema.parse("maybe")).toThrow();
  });

  it("validates step status", () => {
    expect(StepStatusSchema.parse("skipped")).toBe("skipped");
    expect(() => StepStatusSchema.parse("later")).toThrow();
  });

  it("validates log stream", () => {
    expect(LogStreamSchema.parse("stdout")).toBe("stdout");
    expect(LogStreamSchema.parse("event")).toBe("event");
    expect(() => LogStreamSchema.parse("trace")).toThrow();
  });
});
