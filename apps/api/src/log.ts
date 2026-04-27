/**
 * Minimal structured logger for the API server.
 *
 * Writes JSON-structured lines directly to process.stdout/stderr so that
 * log aggregators (Grafana Loki, Cloudflare logpush, etc.) can parse them
 * without depending on console formatting.
 *
 * Usage:
 *   import { log } from "./log";
 *   log.info("[stripe] Checkout completed: sess_xxx");
 *   log.error("[auth] Passkey verification failed", err);
 */

const iso = (): string => new Date().toISOString();

function write(stream: NodeJS.WriteStream, level: string, msg: string): void {
  const line = JSON.stringify({ time: iso(), level, msg });
  stream.write(line + "\n");
}

export const log = {
  info: (msg: string): void => write(process.stdout, "info", msg),
  warn: (msg: string): void => write(process.stderr, "warn", msg),
  error: (msg: string): void => write(process.stderr, "error", msg),
  debug: (msg: string): void => {
    if (process.env["LOG_LEVEL"] === "debug") {
      write(process.stdout, "debug", msg);
    }
  },
};
