// ── Crontech Worker Runtime — Per-worker log ring buffer ───────────
// Long-running customer processes spew logs forever. We buffer the
// last MAX_LINES per stream in memory, drop the oldest when full, and
// fan out new lines to live subscribers (SSE follow-mode).
//
// Real production ingest forwards to Loki via OpenTelemetry — that
// pipeline lives in services/analytics. This module is the in-runtime
// hot path that keeps the most recent slice queryable for `tail`.

import type { LogLine, LogStream } from "./schema";

/** Maximum lines kept per stream per worker. */
export const MAX_LINES_PER_STREAM = 10_000;

export type LogSubscriber = (line: LogLine) => void;

export class LogRingBuffer {
  // Two independent ring buffers per stream — keeps stdout and stderr
  // searchable without one drowning the other.
  private readonly stdout: LogLine[] = [];
  private readonly stderr: LogLine[] = [];
  private readonly subscribers = new Set<LogSubscriber>();
  private nextSequence = 1;

  append(stream: LogStream, text: string, timestamp: number = Date.now()): LogLine {
    const line: LogLine = {
      stream,
      timestamp,
      text,
      sequence: this.nextSequence++,
    };
    const buf = stream === "stdout" ? this.stdout : this.stderr;
    buf.push(line);
    if (buf.length > MAX_LINES_PER_STREAM) {
      buf.shift();
    }
    // Fan out to live subscribers. Errors are isolated — a flaky
    // subscriber must not break delivery for the others.
    for (const sub of this.subscribers) {
      try {
        sub(line);
      } catch {
        // Subscriber crashed; remove it so the buffer doesn't keep
        // calling a broken consumer.
        this.subscribers.delete(sub);
      }
    }
    return line;
  }

  /**
   * Snapshot of buffered lines, oldest-first, optionally filtered to
   * `sequence > since`. Both streams are merged in time order.
   */
  snapshot(since?: number): readonly LogLine[] {
    const cutoff = since ?? 0;
    const merged: LogLine[] = [];
    for (const line of this.stdout) {
      if (line.sequence > cutoff) merged.push(line);
    }
    for (const line of this.stderr) {
      if (line.sequence > cutoff) merged.push(line);
    }
    merged.sort((a, b) => a.sequence - b.sequence);
    return merged;
  }

  subscribe(sub: LogSubscriber): () => void {
    this.subscribers.add(sub);
    return () => {
      this.subscribers.delete(sub);
    };
  }

  size(): { stdout: number; stderr: number } {
    return { stdout: this.stdout.length, stderr: this.stderr.length };
  }

  clear(): void {
    this.stdout.length = 0;
    this.stderr.length = 0;
  }
}
