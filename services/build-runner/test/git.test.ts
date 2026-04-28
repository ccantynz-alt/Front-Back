// ── git client tests ──────────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { GitCli, injectToken } from "../src/git";
import { MemoryLogSink } from "../src/log-sink";
import { MockSpawner } from "./util/mock-spawner";

describe("injectToken", () => {
  test("injects token into https URL", () => {
    const url = injectToken("https://github.com/owner/repo.git", "secret-token");
    expect(url).toContain("x-access-token:secret-token@");
  });

  test("returns URL unchanged if no token", () => {
    const url = injectToken("https://github.com/owner/repo.git", undefined);
    expect(url).toBe("https://github.com/owner/repo.git");
  });

  test("does not inject into ssh URLs", () => {
    const url = injectToken("git@github.com:owner/repo.git", "secret");
    expect(url).toBe("git@github.com:owner/repo.git");
  });
});

describe("GitCli.clone", () => {
  test("runs init → remote add → fetch → checkout", async () => {
    const spawner = new MockSpawner().setFallback({ exitCode: 0 });
    const git = new GitCli(spawner);
    const sink = new MemoryLogSink();
    const res = await git.clone(
      {
        buildId: "b1",
        repo: "https://github.com/foo/bar.git",
        sha: "deadbeef",
        ref: "main",
        targetDir: "/tmp/checkout",
        timeoutMs: 60_000,
      },
      sink,
    );
    expect(res.exitCode).toBe(0);
    // 4 calls: init, remote add, fetch, checkout
    expect(spawner.calls.length).toBe(4);
    expect(spawner.calls[0]?.cmd).toContain("init");
    expect(spawner.calls[1]?.cmd).toContain("remote");
    expect(spawner.calls[2]?.cmd).toContain("fetch");
    expect(spawner.calls[3]?.cmd).toContain("checkout");
  });

  test("falls back to fetching ref when fetch-by-sha fails", async () => {
    // Build a stateful spawner that fails the first fetch and passes the second.
    let fetchCount = 0;
    const stateful: import("../src/spawner").Spawner = {
      run: async (opts, _sink) => {
        const sub = opts.cmd[0] === "git" ? opts.cmd[1] : undefined;
        if (sub === "fetch") {
          fetchCount += 1;
          // First fetch (by sha) → simulate a host that rejects sha fetches
          if (fetchCount === 1) {
            return { exitCode: 1, timedOut: false, stdout: "", stderr: "" };
          }
        }
        return { exitCode: 0, timedOut: false, stdout: "", stderr: "" };
      },
    };
    const git = new GitCli(stateful);
    const res = await git.clone(
      {
        buildId: "b2",
        repo: "https://github.com/foo/bar.git",
        sha: "abc1234",
        ref: "main",
        targetDir: "/tmp/checkout",
        timeoutMs: 60_000,
      },
      new MemoryLogSink(),
    );
    expect(res.exitCode).toBe(0);
    expect(fetchCount).toBe(2); // first fetch failed, second succeeded
  });

  test("returns non-zero exit when init fails", async () => {
    const spawner = new MockSpawner();
    spawner.expect(["init"], { exitCode: 128 });
    spawner.setFallback({ exitCode: 0 });
    const git = new GitCli(spawner);
    const res = await git.clone(
      {
        buildId: "b3",
        repo: "https://github.com/foo/bar.git",
        sha: "abc1234",
        ref: "main",
        targetDir: "/tmp/checkout",
        timeoutMs: 60_000,
      },
      new MemoryLogSink(),
    );
    expect(res.exitCode).toBe(128);
  });
});
