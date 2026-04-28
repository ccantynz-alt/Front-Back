// ── log sink ───────────────────────────────────────────────────────────
// Pluggable log streaming. The runner emits LogLine events line-by-line
// during clone / install / build. Tests use the in-memory sink; the
// production wiring will plug a streaming sink that forwards to the log
// stream service (Loki via OTel collector).

import type { LogLine, LogStream } from "./schemas";

export interface LogSink {
  emit(line: LogLine): void;
}

export class MemoryLogSink implements LogSink {
  readonly lines: LogLine[] = [];
  emit(line: LogLine): void {
    this.lines.push(line);
  }
  textFor(stream: LogStream): string {
    return this.lines
      .filter((l) => l.stream === stream)
      .map((l) => l.line)
      .join("\n");
  }
  reset(): void {
    this.lines.length = 0;
  }
}

export const noopLogSink: LogSink = {
  emit(): void {
    // intentionally empty
  },
};
