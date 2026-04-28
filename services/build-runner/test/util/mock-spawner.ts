// ── deterministic mock spawner for tests ──────────────────────────────
// Tests register canned responses by command-prefix. The mock records
// every spawn for assertions.

import type { LogSink } from "../../src/log-sink";
import type { SpawnOptions, SpawnResult, Spawner } from "../../src/spawner";

export interface CannedResponse {
  readonly stdout?: ReadonlyArray<string>;
  readonly stderr?: ReadonlyArray<string>;
  readonly exitCode: number;
  readonly timedOut?: boolean;
  /** Optional delay (ms) before the response resolves. Used for timeout tests. */
  readonly delayMs?: number;
}

export interface RecordedCall {
  readonly cmd: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>> | undefined;
  readonly timeoutMs: number;
  readonly buildId: string;
}

type Predicate = (cmd: ReadonlyArray<string>) => boolean;

interface Rule {
  readonly match: Predicate;
  readonly response: CannedResponse;
}

export class MockSpawner implements Spawner {
  readonly calls: RecordedCall[] = [];
  private readonly rules: Rule[] = [];
  private fallback: CannedResponse = { exitCode: 0 };

  /** Match any spawn whose command (after sh -c flatten) contains all needles. */
  expect(needles: ReadonlyArray<string>, response: CannedResponse): this {
    this.rules.push({
      match: (cmd) => {
        const flat = cmd.join(" ");
        return needles.every((n) => flat.includes(n));
      },
      response,
    });
    return this;
  }

  /** Match by exact first-arg (e.g. "git", "tar"). */
  expectBin(bin: string, response: CannedResponse): this {
    this.rules.push({
      match: (cmd) => cmd[0] === bin,
      response,
    });
    return this;
  }

  /** Match by needle present anywhere (covers `sh -c "<cmd>"` payloads). */
  expectIncludes(needle: string, response: CannedResponse): this {
    this.rules.push({
      match: (cmd) => cmd.some((c) => c.includes(needle)),
      response,
    });
    return this;
  }

  setFallback(response: CannedResponse): this {
    this.fallback = response;
    return this;
  }

  async run(opts: SpawnOptions, sink: LogSink): Promise<SpawnResult> {
    this.calls.push({
      cmd: opts.cmd,
      cwd: opts.cwd,
      env: opts.env,
      timeoutMs: opts.timeoutMs,
      buildId: opts.buildId,
    });
    const rule = this.rules.find((r) => r.match(opts.cmd));
    const response = rule?.response ?? this.fallback;

    // Honor timeout: if delayMs > timeoutMs, the spawner returns timedOut.
    if (response.delayMs !== undefined && response.delayMs > opts.timeoutMs) {
      return {
        exitCode: -1,
        timedOut: true,
        stdout: "",
        stderr: "",
      };
    }

    if (response.delayMs !== undefined && response.delayMs > 0) {
      await new Promise((r) => setTimeout(r, response.delayMs));
    }

    for (const line of response.stdout ?? []) {
      sink.emit({ buildId: opts.buildId, stream: "stdout", line, ts: Date.now() });
    }
    for (const line of response.stderr ?? []) {
      sink.emit({ buildId: opts.buildId, stream: "stderr", line, ts: Date.now() });
    }
    return {
      exitCode: response.exitCode,
      timedOut: response.timedOut ?? false,
      stdout: (response.stdout ?? []).join("\n"),
      stderr: (response.stderr ?? []).join("\n"),
    };
  }
}
