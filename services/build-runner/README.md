# @back-to-the-future/build-runner

> Stage 2 of the Crontech `git push` deploy pipeline.
> **Faster than Vercel because we use Bun, not Node — and we cache the lockfile aggressively.**

The build-runner takes a `BuildRequest` from the deploy orchestrator, clones the customer repo at a specific sha into a sandbox, detects the framework, runs `bun install` + `bun run build` (or the customer-specified commands), captures the output directory as a content-addressed gzipped tarball, and returns a `BuildArtefact` ready for the deploy stage to push to R2.

---

## Build request schema

```ts
import { buildRequestSchema, type BuildRequest } from "@back-to-the-future/build-runner";
```

| Field              | Type     | Default                                   | Notes                                                |
| ------------------ | -------- | ----------------------------------------- | ---------------------------------------------------- |
| `buildId`          | string   | required                                  | Unique build ID (used as workspace and tarball name) |
| `tenantId`         | string   | required                                  | Owner of the build (carried to the artefact)         |
| `repo`             | URL      | required                                  | HTTPS clone URL of the customer repo                 |
| `ref`              | string   | required                                  | Git ref name (`main`, `release/v1`, etc.)            |
| `sha`              | hex      | required                                  | Specific commit sha to build                         |
| `gitToken`         | string?  | optional                                  | BYO HTTPS token (injected as `x-access-token:<tok>`) |
| `installCommand`   | string   | `bun install --frozen-lockfile`           | Shell command, run via `sh -c`                       |
| `buildCommand`     | string   | `bun install && bun run build`            | Shell command, run via `sh -c`                       |
| `outputDir`        | string   | `dist`                                    | Relative to checkout (or absolute)                   |
| `timeoutMs`        | number   | `600_000` (10 min)                        | Total budget for the entire build                    |
| `memoryLimitBytes` | number   | `4 * 1024**3` (4 GiB)                     | Best-effort; cgroups used when host supports it      |
| `env`              | record   | `{}`                                      | Allowlisted env injected into install + build        |

## Build artefact (output)

```ts
import { buildArtefactSchema, type BuildArtefact } from "@back-to-the-future/build-runner";
```

| Field         | Type                                | Notes                                                  |
| ------------- | ----------------------------------- | ------------------------------------------------------ |
| `buildId`     | string                              | Echoes the request                                     |
| `tenantId`    | string                              | Echoes the request                                     |
| `sha`         | string                              | Echoes the request                                     |
| `framework`   | `Framework` enum                    | See list below                                         |
| `tarballPath` | absolute path                       | gzipped tar of the output directory                    |
| `sizeBytes`   | int                                 | Tarball size                                           |
| `sha256`      | 64-char hex                         | sha256 of the tarball — content-addressable identifier |
| `durationMs`  | int                                 | Total wall time, clone → tarball                       |
| `exitCode`    | int                                 | `0` on success                                         |
| `cacheHit`    | boolean                             | `true` if `node_modules` was restored from cache       |
| `outputDir`   | string                              | Echoes the request                                     |
| `detectedAt`  | ISO 8601 timestamp                  | When the artefact was produced                         |

`BuildResult = { ok: true; artefact; cleanup() } | { ok: false; failure }` — failure codes: `CLONE_FAILED`, `INSTALL_FAILED`, `BUILD_FAILED`, `TIMEOUT`, `OUTPUT_DIR_MISSING`, `TARBALL_FAILED`, `VALIDATION_FAILED`.

## Supported frameworks

`solidstart`, `nextjs`, `astro`, `vite`, `bun`, `node`, `static`, `unknown`.

Detection precedence: dependency manifest → config file → script analysis → `index.html` fallback. SolidStart wins via `@solidjs/start` or legacy `solid-start`. Next.js wins via `next` dep or any `next.config.*`. Astro wins via `astro` dep or `astro.config.*`. Vite wins via `vite` dep or `vite.config.*`. A `package.json` with bun-flavoured scripts (or `engines.bun`) classifies as `bun`. Anything else with a build/start script becomes `node`. A bare `index.html` is `static`. Otherwise: `unknown`.

## Cache layer

- Cache key = `sha256(<lockfile bytes> || <lockfile name>)`.
- Lockfile priority: `bun.lock` > `bun.lockb` > `package-lock.json` > `yarn.lock` > `pnpm-lock.yaml`.
- Cache hit → restore `node_modules`, skip install. Build still runs.
- Cache miss → install runs, then `node_modules` is saved under the key for the next build.
- Default store is `FilesystemCacheStore` (host disk). R2 adapter is on the orchestrator side.

## Sandboxing model

- Each build gets its own tmpdir (`<os.tmpdir()>/crontech-build-runner/<buildId>`).
- All subprocesses (`git`, `sh`, `tar`) run with `cwd` confined to that tmpdir.
- `timeoutMs` is enforced via `Bun.spawn` + `proc.kill()` on overflow.
- `memoryLimitBytes` is honoured best-effort: cgroups when available, otherwise advisory.
- Workspace cleanup runs unconditionally on FAILURE.
- On SUCCESS the runner returns a `cleanup()` callback — the caller (orchestrator) invokes it AFTER persisting the tarball to R2 so we don't have to copy the tarball off the build host.

## Environment variables (build host)

| Variable                | Required | Description                                       |
| ----------------------- | -------- | ------------------------------------------------- |
| `BUILD_RUNNER_CACHE_DIR`| optional | Override the cache directory (default: `os.tmpdir()/crontech-build-runner-cache`) |
| `BUILD_RUNNER_TAR_BIN`  | optional | Override the `tar` binary (default: `tar`)        |
| `BUILD_RUNNER_GIT_BIN`  | optional | Override the `git` binary (default: `git`)        |

(Customer-side env — secrets, build-time config — is injected via `BuildRequest.env` and managed by the orchestrator + secrets-vault, not by this service.)

## Tarball implementation

We shell out to the POSIX `tar` CLI (gzipped tarballs). Reasoning:

- `tar` is universally available on Linux build hosts.
- Native `tar` is significantly faster than any pure-JS implementation.
- Battle-tested — the build host already trusts `tar`.

A pure-JS fallback was considered and rejected; if a future build host lacks `tar` we'll add an adapter rather than swap the default.

## Contract for the orchestrator (Agent 3 — deploy-orchestrator)

```ts
import { BuildRunner, BunSpawner, GitCli, TarCli, FilesystemCacheStore, TmpdirWorkspaceFactory, MemoryLogSink } from "@back-to-the-future/build-runner";

const spawner = new BunSpawner();
const tar = new TarCli(spawner);
const runner = new BuildRunner({
  spawner,
  git: new GitCli(spawner),
  tar,
  cache: new FilesystemCacheStore("/var/cache/crontech/build", tar),
  workspaceFactory: new TmpdirWorkspaceFactory(),
  logSink: yourLogSink,         // forward to the log stream service
});

const result = await runner.run(buildRequest);
if (!result.ok) {
  // result.failure: { code, message, exitCode, durationMs }
  // already cleaned up; record the failure and return.
  return;
}
// result.artefact is ready. Persist tarballPath to R2, then:
await result.cleanup();
```

The orchestrator should:

1. Stream `BuildRequest` events (e.g. from a queue) into `runner.run()`.
2. Surface every emitted `LogLine` via the log stream service.
3. On success, upload `artefact.tarballPath` to durable storage, then call `cleanup()`.
4. On failure, log `failure.code` and surface the reason to the customer.

## Tests

`bun test services/build-runner` — 46 hermetic tests covering framework detection (5+ frameworks), build success path, every failure mode, log streaming, lockfile cache hit/miss, schema shape, and workspace cleanup. No real subprocesses, no network — fully sandboxed.
