// ── @back-to-the-future/build-runner ───────────────────────────────────
// Entrypoint. Re-exports the public API for the orchestrator.
//
// Crontech build runner — Bun-native, multi-framework, lockfile-cached,
// sandboxed. The second stage of the git-push deploy pipeline.

export {
  buildArtefactSchema,
  buildRequestSchema,
  frameworkSchema,
  logLineSchema,
  logStreamSchema,
} from "./schemas";

export type {
  BuildArtefact,
  BuildFailure,
  BuildFailureCode,
  BuildRequest,
  BuildResult,
  Framework,
  LogLine,
  LogStream,
} from "./schemas";

export { BuildRunner } from "./runner";
export type { BuildRunnerDeps } from "./runner";

export { detectFramework } from "./framework";
export type { FilesystemProbe } from "./framework";

export { BunSpawner } from "./spawner";
export type { Spawner, SpawnOptions, SpawnResult } from "./spawner";

export { GitCli, injectToken } from "./git";
export type { GitClient, GitCloneRequest } from "./git";

export { TarCli, fileSha256, fileSize } from "./tarball";
export type { Tarball } from "./tarball";

export { FilesystemCacheStore, computeCacheKey } from "./cache";
export type { CacheStore } from "./cache";

export { TmpdirWorkspaceFactory } from "./workspace";
export type { Workspace, WorkspaceFactory } from "./workspace";

export { MemoryLogSink, noopLogSink } from "./log-sink";
export type { LogSink } from "./log-sink";
