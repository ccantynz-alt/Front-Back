// ── git clone helper ──────────────────────────────────────────────────
// Bun has no native git client — we shell out to `git`. To minimise
// transfer time we shallow-clone (`--depth 1`) and fetch the specific sha.
//
// BYO-token: if `gitToken` is provided we inject it into the URL via
// `https://x-access-token:<token>@host/owner/repo.git`. Otherwise we
// assume the repo is public.

import type { Spawner } from "./spawner";
import type { LogSink } from "./log-sink";

export interface GitCloneRequest {
  readonly buildId: string;
  readonly repo: string;
  readonly sha: string;
  readonly ref: string;
  readonly targetDir: string;
  readonly gitToken?: string | undefined;
  readonly timeoutMs: number;
}

export interface GitClient {
  clone(req: GitCloneRequest, sink: LogSink): Promise<{ exitCode: number }>;
}

export function injectToken(repoUrl: string, token: string | undefined): string {
  if (!token) return repoUrl;
  try {
    const u = new URL(repoUrl);
    if (u.protocol !== "https:") return repoUrl;
    u.username = "x-access-token";
    u.password = token;
    return u.toString();
  } catch {
    return repoUrl;
  }
}

export class GitCli implements GitClient {
  constructor(
    private readonly spawner: Spawner,
    private readonly gitBin: string = "git",
  ) {}

  async clone(req: GitCloneRequest, sink: LogSink): Promise<{ exitCode: number }> {
    const url = injectToken(req.repo, req.gitToken);
    // Shallow clone of the ref, then `checkout` the sha. This is the
    // fastest path that still resolves an arbitrary commit.
    // Sequence:
    //   git init
    //   git remote add origin <url>
    //   git fetch --depth 1 origin <sha>
    //   git checkout FETCH_HEAD
    const init = await this.spawner.run(
      {
        buildId: req.buildId,
        cmd: [this.gitBin, "init", "-q", req.targetDir],
        cwd: ".",
        timeoutMs: req.timeoutMs,
      },
      sink,
    );
    if (init.exitCode !== 0) return { exitCode: init.exitCode };

    const addRemote = await this.spawner.run(
      {
        buildId: req.buildId,
        cmd: [this.gitBin, "remote", "add", "origin", url],
        cwd: req.targetDir,
        timeoutMs: req.timeoutMs,
      },
      sink,
    );
    if (addRemote.exitCode !== 0) return { exitCode: addRemote.exitCode };

    const fetch = await this.spawner.run(
      {
        buildId: req.buildId,
        cmd: [this.gitBin, "fetch", "--depth", "1", "origin", req.sha],
        cwd: req.targetDir,
        timeoutMs: req.timeoutMs,
      },
      sink,
    );
    if (fetch.exitCode !== 0) {
      // Some hosts disallow fetch-by-sha; fall back to fetching the ref
      // and checking out the sha from there.
      const fetchRef = await this.spawner.run(
        {
          buildId: req.buildId,
          cmd: [this.gitBin, "fetch", "--depth", "1", "origin", req.ref],
          cwd: req.targetDir,
          timeoutMs: req.timeoutMs,
        },
        sink,
      );
      if (fetchRef.exitCode !== 0) return { exitCode: fetchRef.exitCode };
    }

    const checkout = await this.spawner.run(
      {
        buildId: req.buildId,
        cmd: [this.gitBin, "checkout", "-q", req.sha],
        cwd: req.targetDir,
        timeoutMs: req.timeoutMs,
      },
      sink,
    );
    return { exitCode: checkout.exitCode };
  }
}
