import { z } from "zod";

export const BuildKindSchema = z.enum([
  "deploy",
  "ingest",
  "migration",
  "gate",
  "voice",
  "agent",
  "sentinel",
  "other",
]);
export type BuildKind = z.infer<typeof BuildKindSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const StepStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const LogStreamSchema = z.enum(["stdout", "stderr", "event"]);
export type LogStream = z.infer<typeof LogStreamSchema>;

export interface StartRunInput {
  readonly kind: BuildKind;
  readonly title: string;
  readonly actorUserId?: string | null;
  readonly actorLabel?: string | null;
  readonly gitBranch?: string | null;
  readonly gitSha?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface StepHandle {
  readonly id: string;
  readonly runId: string;
  readonly name: string;
  log(line: string, stream?: LogStream): Promise<void>;
  succeed(): Promise<void>;
  fail(error: Error | string, exitCode?: number): Promise<void>;
  skip(reason?: string): Promise<void>;
}

export interface RunHandle {
  readonly id: string;
  readonly kind: BuildKind;
  step<T>(
    name: string,
    fn: (step: StepHandle) => Promise<T>,
  ): Promise<T>;
  log(line: string, stream?: LogStream): Promise<void>;
  succeed(): Promise<void>;
  fail(error: Error | string): Promise<void>;
  cancel(): Promise<void>;
  /** Check whether an operator has requested cancellation mid-flight. */
  isCancelRequested(): Promise<boolean>;
}
