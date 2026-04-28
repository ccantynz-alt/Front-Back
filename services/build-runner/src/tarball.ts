// ── tarball helper ────────────────────────────────────────────────────
// Captures a build output directory as a content-hashed tarball.
//
// Implementation choice: we shell out to `tar` (POSIX standard, present
// on every Linux build host, Bun-native subprocess). A pure-JS tar
// implementation was considered but rejected — tar is universally
// available, faster than JS, and battle-tested.
//
// We expose a small Tarball interface so tests can mock it without
// requiring a real tar binary in the test environment.

import * as path from "node:path";
import { createHash } from "node:crypto";
import type { Spawner } from "./spawner";
import { noopLogSink } from "./log-sink";

export interface Tarball {
  /** Create a gzipped tarball from sourceDir → archivePath. */
  create(sourceDir: string, archivePath: string): Promise<void>;
  /** Extract a gzipped tarball at archivePath → targetDir. */
  extract(archivePath: string, targetDir: string): Promise<void>;
}

export class TarCli implements Tarball {
  constructor(
    private readonly spawner: Spawner,
    private readonly tarBin: string = "tar",
  ) {}

  async create(sourceDir: string, archivePath: string): Promise<void> {
    const parent = path.dirname(sourceDir);
    const base = path.basename(sourceDir);
    const result = await this.spawner.run(
      {
        buildId: "tarball.create",
        cmd: [this.tarBin, "-czf", archivePath, "-C", parent, base],
        cwd: parent,
        timeoutMs: 5 * 60 * 1000,
      },
      noopLogSink,
    );
    if (result.exitCode !== 0) {
      throw new Error(`tar create failed (exit=${result.exitCode}): ${result.stderr}`);
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    const result = await this.spawner.run(
      {
        buildId: "tarball.extract",
        cmd: [this.tarBin, "-xzf", archivePath, "-C", targetDir],
        cwd: targetDir,
        timeoutMs: 5 * 60 * 1000,
      },
      noopLogSink,
    );
    if (result.exitCode !== 0) {
      throw new Error(`tar extract failed (exit=${result.exitCode}): ${result.stderr}`);
    }
  }
}

// ── content addressing ───────────────────────────────────────────────
export async function fileSha256(filepath: string): Promise<string> {
  const file = Bun.file(filepath);
  const buf = await file.arrayBuffer();
  const hash = createHash("sha256");
  hash.update(new Uint8Array(buf));
  return hash.digest("hex");
}

export async function fileSize(filepath: string): Promise<number> {
  const file = Bun.file(filepath);
  return file.size;
}
