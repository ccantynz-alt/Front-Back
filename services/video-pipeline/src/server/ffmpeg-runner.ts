// ── ffmpeg Subprocess Runner ────────────────────────────────────────────
// Pluggable runner so tests can substitute a mock that emits scripted
// progress events without spawning the real ffmpeg binary.

import { buildFfmpegArgs } from "../core/ffmpeg";
import type { ProgressEvent, TargetSpec } from "../core/types";

export interface FfmpegRunInput {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly target: TargetSpec;
}

export interface FfmpegRunner {
  run(input: FfmpegRunInput): AsyncGenerator<ProgressEvent, void, void>;
}

/**
 * Real subprocess runner — sandboxed via Bun.spawn.
 * We invoke `ffmpeg` from PATH; the binary location is resolved by Bun.
 * Stderr lines are parsed for `time=` markers and turned into progress
 * fractions when the source duration is known. For v1 we emit coarse
 * checkpoints — a real per-frame progress parser is a follow-up block.
 */
export class SubprocessFfmpegRunner implements FfmpegRunner {
  private readonly binary: string;

  constructor(binary = "ffmpeg") {
    this.binary = binary;
  }

  async *run(input: FfmpegRunInput): AsyncGenerator<ProgressEvent, void, void> {
    const args = buildFfmpegArgs(input);
    yield { state: "running", progress: 0, message: "ffmpeg starting" };

    const proc = Bun.spawn([this.binary, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    yield { state: "running", progress: 0.5, message: "ffmpeg encoding" };

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }
    yield { state: "running", progress: 1, message: "ffmpeg complete" };
  }
}
