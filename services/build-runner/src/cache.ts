// ── lockfile-keyed node_modules cache ─────────────────────────────────
// Crontech's build runner is faster than Vercel's because we cache
// aggressively. Cache key = sha256(lockfile contents). Same lockfile
// → reuse `node_modules` from a previous build.
//
// Storage abstraction is pluggable: production uses a directory on the
// build host (or R2 bucket via a future adapter); tests use the in-memory
// store at test/util/mock-cache-store.ts.

import * as path from "node:path";
import { createHash } from "node:crypto";

export interface CacheStore {
  /** Returns true if a cached node_modules exists for this key. */
  has(key: string): Promise<boolean>;
  /** Restores a cached node_modules into `targetDir`. Returns true if hit. */
  restore(key: string, targetDir: string): Promise<boolean>;
  /** Saves a node_modules from `sourceDir` under this key. */
  save(key: string, sourceDir: string): Promise<void>;
}

const LOCKFILES = ["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

interface LockfileProbe {
  read(filepath: string): Promise<Uint8Array | null>;
}

const defaultProbe: LockfileProbe = {
  async read(filepath: string): Promise<Uint8Array | null> {
    const file = Bun.file(filepath);
    if (!(await file.exists())) return null;
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  },
};

/**
 * Compute the cache key for a checkout directory.
 * - Reads the first existing lockfile (in priority order).
 * - sha256 of its contents = cache key.
 * - Returns null if no lockfile exists (cache disabled for this build).
 */
export async function computeCacheKey(
  checkoutDir: string,
  probe: LockfileProbe = defaultProbe,
): Promise<string | null> {
  for (const name of LOCKFILES) {
    const buf = await probe.read(path.join(checkoutDir, name));
    if (buf) {
      const hash = createHash("sha256");
      hash.update(buf);
      // include the lockfile name so different package managers don't collide
      hash.update(name);
      return hash.digest("hex");
    }
  }
  return null;
}

// ── filesystem-backed cache store ────────────────────────────────────
// Used in production. Uses tar via the Spawner abstraction… but the cache
// store is intentionally Bun-native and synchronous over directories so
// tests can swap it cleanly. Real implementation copies a `.tar.gz`
// archive into the build's `node_modules`. The tarball helper is in
// `tarball.ts`; we keep the cache adapter minimal here.

import type { Tarball } from "./tarball";

export class FilesystemCacheStore implements CacheStore {
  constructor(
    private readonly cacheDir: string,
    private readonly tar: Tarball,
  ) {}

  private archivePath(key: string): string {
    return path.join(this.cacheDir, `${key}.tar.gz`);
  }

  async has(key: string): Promise<boolean> {
    return Bun.file(this.archivePath(key)).exists();
  }

  async restore(key: string, targetDir: string): Promise<boolean> {
    const archive = this.archivePath(key);
    if (!(await Bun.file(archive).exists())) return false;
    await this.tar.extract(archive, targetDir);
    return true;
  }

  async save(key: string, sourceDir: string): Promise<void> {
    await this.tar.create(sourceDir, this.archivePath(key));
  }
}
