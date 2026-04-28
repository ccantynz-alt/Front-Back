// ── shared test fixtures ──────────────────────────────────────────────
// Mock implementations of every Spawner-adjacent interface so the
// runner can be exercised hermetically.

import type { CacheStore } from "../../src/cache";
import type { GitClient, GitCloneRequest } from "../../src/git";
import type { LogSink } from "../../src/log-sink";
import type { Tarball } from "../../src/tarball";
import type { Workspace, WorkspaceFactory } from "../../src/workspace";
import type { FilesystemProbe } from "../../src/framework";

export class MockGitClient implements GitClient {
  readonly calls: GitCloneRequest[] = [];
  exitCode = 0;
  async clone(req: GitCloneRequest, _sink: LogSink): Promise<{ exitCode: number }> {
    this.calls.push(req);
    return { exitCode: this.exitCode };
  }
}

export class MockTarball implements Tarball {
  readonly created: Array<{ source: string; archive: string }> = [];
  readonly extracted: Array<{ archive: string; target: string }> = [];
  shouldFail = false;
  async create(sourceDir: string, archivePath: string): Promise<void> {
    this.created.push({ source: sourceDir, archive: archivePath });
    if (this.shouldFail) throw new Error("mock tar failure");
    // Drop a real, deterministic file so fileSha256/fileSize work in
    // tests that need them. (8 bytes of zero — enough to hash.)
    await Bun.write(archivePath, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
  }
  async extract(archivePath: string, targetDir: string): Promise<void> {
    this.extracted.push({ archive: archivePath, target: targetDir });
  }
}

export class MockCacheStore implements CacheStore {
  private readonly entries = new Map<string, string>(); // key -> sourceDir
  saveCalls: string[] = [];
  restoreCalls: string[] = [];

  async has(key: string): Promise<boolean> {
    return this.entries.has(key);
  }
  async restore(key: string, _targetDir: string): Promise<boolean> {
    this.restoreCalls.push(key);
    return this.entries.has(key);
  }
  async save(key: string, sourceDir: string): Promise<void> {
    this.saveCalls.push(key);
    this.entries.set(key, sourceDir);
  }
  /** Test helper: pretend the cache already has this key. */
  prime(key: string, sourceDir = "primed"): void {
    this.entries.set(key, sourceDir);
  }
}

export interface MockWorkspaceOptions {
  readonly checkoutDir?: string;
  readonly artefactsDir?: string;
}

export class MockWorkspaceFactory implements WorkspaceFactory {
  cleanups = 0;
  constructor(private readonly opts: MockWorkspaceOptions = {}) {}
  async create(buildId: string): Promise<Workspace> {
    const root = `/tmp/mock/${buildId}`;
    const checkoutDir = this.opts.checkoutDir ?? `${root}/checkout`;
    const artefactsDir = this.opts.artefactsDir ?? `${root}/artefacts`;
    return {
      buildId,
      root,
      checkoutDir,
      artefactsDir,
      cleanup: async () => {
        this.cleanups += 1;
      },
    };
  }
}

interface ProbeFile {
  readonly content?: string;
}

export class MockFilesystemProbe implements FilesystemProbe {
  private readonly files = new Map<string, ProbeFile>();
  setPackageJson(dir: string, pkg: object): this {
    this.files.set(`${dir}/package.json`, { content: JSON.stringify(pkg) });
    return this;
  }
  setFile(dir: string, name: string, content = ""): this {
    this.files.set(`${dir}/${name}`, { content });
    return this;
  }
  async readPackageJson(dir: string): Promise<{
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    engines?: Record<string, string>;
  } | null> {
    const f = this.files.get(`${dir}/package.json`);
    if (!f?.content) return null;
    return JSON.parse(f.content);
  }
  async hasFile(dir: string, filename: string): Promise<boolean> {
    return this.files.has(`${dir}/${filename}`);
  }
}
