// ── subprocess spawner abstraction ────────────────────────────────────
// Production: Bun.spawn (CLAUDE.md §3 — Bun-native everywhere).
// Tests: a deterministic mock spawner (see test/util/mock-spawner.ts).
//
// Why a seam: tests must NOT actually `git clone` real repos, run real
// `bun install`, or spawn real child processes. The runner is built
// around the Spawner interface so tests inject canned responses.

import type { LogSink } from "./log-sink";

export interface SpawnOptions {
  readonly buildId: string;
  readonly cmd: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

export interface SpawnResult {
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Spawner {
  run(opts: SpawnOptions, sink: LogSink): Promise<SpawnResult>;
}

// ── line streaming helper ────────────────────────────────────────────
// stdout/stderr arrive as chunks; we want one LogLine per *line* so the
// downstream log stream service can index/search per-line.
async function streamLines(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  if (!stream) return;
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const idx = buffer.lastIndexOf("\n");
      if (idx >= 0) {
        const complete = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        for (const line of complete.split("\n")) onLine(line);
      }
    }
    // final flush
    buffer += decoder.decode();
    if (buffer.length > 0) {
      for (const line of buffer.split("\n")) {
        if (line.length > 0) onLine(line);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Sentinel marker — `process.exited` resolves to a number; the timeout
// branch resolves to this symbol so we can disambiguate.
const TIMEOUT_SENTINEL: unique symbol = Symbol("build-runner.timeout");

interface KillableProcess {
  readonly exited: Promise<number>;
  readonly stdout: ReadableStream<Uint8Array> | null | undefined;
  readonly stderr: ReadableStream<Uint8Array> | null | undefined;
  kill(): void;
}

async function awaitWithTimeout(
  proc: KillableProcess,
  timeoutMs: number,
): Promise<number | typeof TIMEOUT_SENTINEL> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutP = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
  });
  try {
    return await Promise.race([proc.exited, timeoutP]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export class BunSpawner implements Spawner {
  async run(opts: SpawnOptions, sink: LogSink): Promise<SpawnResult> {
    const stdoutBuf: string[] = [];
    const stderrBuf: string[] = [];

    const [first, ...rest] = opts.cmd;
    if (first === undefined) {
      throw new Error("spawner: cmd cannot be empty");
    }
    const proc = Bun.spawn([first, ...rest], {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdout: "pipe",
      stderr: "pipe",
    });

    // Bun.spawn returns Subprocess; narrow to the structural shape we use.
    const killable: KillableProcess = {
      exited: proc.exited,
      stdout: proc.stdout as ReadableStream<Uint8Array> | null | undefined,
      stderr: proc.stderr as ReadableStream<Uint8Array> | null | undefined,
      kill: () => proc.kill(),
    };

    const stdoutP = streamLines(killable.stdout, (line) => {
      stdoutBuf.push(line);
      sink.emit({ buildId: opts.buildId, stream: "stdout", line, ts: Date.now() });
    });
    const stderrP = streamLines(killable.stderr, (line) => {
      stderrBuf.push(line);
      sink.emit({ buildId: opts.buildId, stream: "stderr", line, ts: Date.now() });
    });

    const result = await awaitWithTimeout(killable, opts.timeoutMs);
    if (result === TIMEOUT_SENTINEL) {
      killable.kill();
      await Promise.allSettled([stdoutP, stderrP]);
      return {
        exitCode: -1,
        timedOut: true,
        stdout: stdoutBuf.join("\n"),
        stderr: stderrBuf.join("\n"),
      };
    }
    await Promise.allSettled([stdoutP, stderrP]);
    return {
      exitCode: result,
      timedOut: false,
      stdout: stdoutBuf.join("\n"),
      stderr: stderrBuf.join("\n"),
    };
  }
}
