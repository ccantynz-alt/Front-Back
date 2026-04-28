/**
 * Privacy-first session correlation.
 *
 * We never persist raw IP addresses. Instead the collector derives an
 * opaque session id from a daily-rotating salt + IP + User-Agent, so:
 *
 *   sid = sha256(salt_for_day(now) || ip || ua)[:16]
 *
 * The salt rotates every UTC day. After rotation, yesterday's session
 * ids become uncorrelatable with today's — i.e. an IP address can never
 * be linked across days, by design. This is the same posture as Plausible.
 *
 * The salt itself is held in memory only. Restart the process and a fresh
 * salt is minted; existing in-flight sessions become uncorrelatable, which
 * is the conservative choice from a privacy standpoint.
 */
import { createHash, randomBytes } from "node:crypto";

const SALT_BYTES = 32;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SaltStoreOptions {
  /** Random source — overridable for tests. */
  randomSource?: () => Buffer;
  /** Authoritative clock — overridable for tests. */
  now?: () => number;
}

/**
 * Holds the daily rotating salt. Each call to `currentSalt(now)` returns
 * the salt for the UTC day that contains `now`, minting a fresh one when
 * the day rolls over.
 */
export class DailySaltStore {
  private readonly randomSource: () => Buffer;
  private readonly now: () => number;
  private salt: Buffer;
  private dayKey: number;

  constructor(opts: SaltStoreOptions = {}) {
    this.randomSource = opts.randomSource ?? (() => randomBytes(SALT_BYTES));
    this.now = opts.now ?? (() => Date.now());
    this.salt = this.randomSource();
    this.dayKey = Math.floor(this.now() / DAY_MS);
  }

  currentSalt(at?: number): Buffer {
    const ts = typeof at === "number" ? at : this.now();
    const day = Math.floor(ts / DAY_MS);
    if (day !== this.dayKey) {
      this.salt = this.randomSource();
      this.dayKey = day;
    }
    return this.salt;
  }

  /** Diagnostic — current day key (UTC days since epoch). */
  day(): number {
    return this.dayKey;
  }
}

/**
 * Derive a 16-char hex session id from the current salt + ip + ua.
 * Pure function — given the same inputs it returns the same output.
 */
export function deriveSessionId(salt: Buffer, ip: string, ua: string): string {
  const hash = createHash("sha256");
  hash.update(salt);
  hash.update("\n");
  hash.update(ip);
  hash.update("\n");
  hash.update(ua);
  return hash.digest("hex").slice(0, 16);
}
