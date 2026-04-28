// ── Crontech Edge Runtime — Per-tenant console capture ──────────────
// A `console` shim that records every `log` / `warn` / `error` /
// `info` / `debug` call made by a tenant's bundle. The captured lines
// are returned at the end of an invocation so the dispatcher can stream
// them to the platform's log pipeline (Loki / Grafana, see BLK-014).
//
// We deliberately do NOT delegate to the host `console` — that would
// leak tenant output into operator logs and create noisy multi-tenant
// log files. Capture-only is the contract.

export type ConsoleLevel = "log" | "warn" | "error" | "info" | "debug";

/**
 * Structural Console-compatible interface produced by
 * {@link ConsoleCapture#asConsole}. This is a deliberate subset of the
 * built-in `Console` type — we ship the methods customer code reaches
 * for and skip the host-only stream surface.
 */
export interface CapturingConsole {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  table(...args: unknown[]): void;
  dir(...args: unknown[]): void;
  dirxml(...args: unknown[]): void;
  group(...args: unknown[]): void;
  groupCollapsed(...args: unknown[]): void;
  groupEnd(): void;
  time(): void;
  timeEnd(): void;
  timeLog(...args: unknown[]): void;
  count(...args: unknown[]): void;
  countReset(): void;
  clear(): void;
  assert(cond: unknown, ...args: unknown[]): void;
  profile(): void;
  profileEnd(): void;
  timeStamp(): void;
}

export interface CapturedLogLine {
  /** Monotonically increasing index per invocation, starting at 0. */
  readonly seq: number;
  /** ms since invocation start, useful for cold-start tracing. */
  readonly tMs: number;
  readonly level: ConsoleLevel;
  /** Pre-rendered message — the same shape Node.js produces. */
  readonly message: string;
}

export interface ConsoleCaptureSnapshot {
  readonly lines: readonly CapturedLogLine[];
  /** Number of lines that were dropped due to the limit. */
  readonly dropped: number;
  /** Number of bytes of message text dropped due to the byte cap. */
  readonly droppedBytes: number;
}

export interface ConsoleCaptureOptions {
  /** Maximum number of captured lines per invocation. Default: 1_000. */
  readonly maxLines?: number;
  /** Maximum total bytes of captured message text. Default: 256 KiB. */
  readonly maxBytes?: number;
  /** ms reference — defaults to performance.now(). Injectable for tests. */
  readonly now?: () => number;
}

const DEFAULT_MAX_LINES = 1_000;
const DEFAULT_MAX_BYTES = 256 * 1024;

/**
 * A capture-and-format `console` substitute. Created per-invocation so
 * each request has its own isolated log stream — the same way Cloudflare
 * Workers and Vercel Edge functions report logs.
 *
 * The shape we expose to the bundle deliberately mirrors a real
 * `Console` so customer code that does `console.log(...)` "just works".
 */
export class ConsoleCapture {
  private readonly lines: CapturedLogLine[] = [];
  private readonly start: number;
  private readonly maxLines: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private bytes = 0;
  private dropped = 0;
  private droppedBytes = 0;

  constructor(options: ConsoleCaptureOptions = {}) {
    this.maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.now = options.now ?? ((): number => performance.now());
    this.start = this.now();
  }

  private push(level: ConsoleLevel, args: readonly unknown[]): void {
    const message = formatArgs(args);
    const messageBytes = Buffer.byteLength(message, "utf8");

    if (this.lines.length >= this.maxLines) {
      this.dropped += 1;
      this.droppedBytes += messageBytes;
      return;
    }
    if (this.bytes + messageBytes > this.maxBytes) {
      this.dropped += 1;
      this.droppedBytes += messageBytes;
      return;
    }
    this.bytes += messageBytes;
    this.lines.push({
      seq: this.lines.length,
      tMs: Math.max(0, this.now() - this.start),
      level,
      message,
    });
  }

  /**
   * The object handed into the isolate as `globalThis.console`. Bound
   * methods so customer code that does `const log = console.log;
   * log(...)` still works. Returns a structural Console-compatible
   * object — we deliberately don't claim to be a full Node `Console`
   * (which has stream-bound methods we don't need to implement).
   */
  asConsole(): CapturingConsole {
    const self = this;
    const handler =
      (level: ConsoleLevel) =>
      (...args: unknown[]): void => {
        self.push(level, args);
      };
    const log = handler("log");
    const warn = handler("warn");
    const error = handler("error");
    const info = handler("info");
    const debug = handler("debug");
    const noop = (): void => {};
    return {
      log,
      warn,
      error,
      info,
      debug,
      trace: log,
      table: log,
      dir: log,
      dirxml: log,
      group: log,
      groupCollapsed: log,
      groupEnd: noop,
      time: noop,
      timeEnd: noop,
      timeLog: log,
      count: log,
      countReset: noop,
      clear: noop,
      assert: (cond: unknown, ...args: unknown[]): void => {
        if (cond === false || cond === null || cond === undefined || cond === 0) {
          self.push("error", ["Assertion failed:", ...args]);
        }
      },
      profile: noop,
      profileEnd: noop,
      timeStamp: noop,
    };
  }

  snapshot(): ConsoleCaptureSnapshot {
    return {
      lines: this.lines.slice(),
      dropped: this.dropped,
      droppedBytes: this.droppedBytes,
    };
  }
}

// ── Argument formatting ─────────────────────────────────────────────

/**
 * Render `console.log(...args)` to a single string. Matches Node.js
 * formatting for primitive types and serialises objects as JSON when
 * possible. Cyclic structures fall back to a stable marker.
 */
export function formatArgs(args: readonly unknown[]): string {
  if (args.length === 0) return "";
  return args.map(formatOne).join(" ");
}

function formatOne(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "string") return value as string;
  if (t === "number" || t === "boolean" || t === "bigint" || t === "symbol") {
    return String(value);
  }
  if (t === "function") {
    const name = (value as { name?: string }).name ?? "anonymous";
    return `[Function: ${name}]`;
  }
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[Circular]";
  }
}
