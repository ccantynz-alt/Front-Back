// ── Crontech Worker Runtime — Default Bun.spawn implementation ──────
// Production wrapper around `Bun.spawn` that fulfils the `ProcessSpawner`
// interface from supervisor.ts. Tests inject a fake spawner instead.
//
// The spawner is intentionally thin: tarball preparation, restart
// policy, and resource enforcement live in the supervisor. This module
// just turns a `RegisteredWorker` into a `SupervisedProcess` handle.

import type { ProcessSpawner, SupervisedProcess } from "./supervisor";

/**
 * Splits a chunk of bytes into NL-delimited lines, calling `onLine`
 * for each. Trailing partial lines are buffered between calls.
 */
function lineBuffer(onLine: (text: string) => void): (chunk: Uint8Array) => void {
  const decoder = new TextDecoder();
  let pending = "";
  return (chunk) => {
    pending += decoder.decode(chunk, { stream: true });
    let idx = pending.indexOf("\n");
    while (idx !== -1) {
      const line = pending.slice(0, idx);
      pending = pending.slice(idx + 1);
      onLine(line);
      idx = pending.indexOf("\n");
    }
  };
}

async function pumpReadable(
  stream: ReadableStream<Uint8Array> | undefined,
  onLine: (text: string) => void,
): Promise<void> {
  if (stream === undefined) return;
  const reader = stream.getReader();
  const feed = lineBuffer(onLine);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value !== undefined) feed(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/** Default production spawner. Wraps `Bun.spawn`. */
export const defaultSpawnProcess: ProcessSpawner = async ({ worker, workdir }) => {
  // Bun is the runtime everywhere — but make the import safe-ish by
  // accessing the global so this module remains type-checkable when
  // bun-types are absent in a downstream consumer.
  const bun = (globalThis as { Bun?: typeof Bun }).Bun;
  if (bun === undefined || typeof bun.spawn !== "function") {
    throw new Error("Bun.spawn unavailable — worker-runtime requires Bun");
  }
  const env: Record<string, string> = { ...worker.env, ...worker.secrets };
  const [head, ...rest] = worker.command;
  if (head === undefined) {
    throw new Error("worker command must have at least one element");
  }
  const subprocess = bun.spawn([head, ...rest], {
    cwd: workdir,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const handle: SupervisedProcess = {
    pid: subprocess.pid ?? -1,
    exited: subprocess.exited.then((code) =>
      typeof code === "number" ? code : null,
    ),
    kill(signal) {
      try {
        subprocess.kill(signal as number | undefined);
      } catch {
        // already exited
      }
    },
    readStdout(onLine) {
      void pumpReadable(
        subprocess.stdout as ReadableStream<Uint8Array> | undefined,
        onLine,
      );
    },
    readStderr(onLine) {
      void pumpReadable(
        subprocess.stderr as ReadableStream<Uint8Array> | undefined,
        onLine,
      );
    },
    readMemoryRss() {
      // Bun does not expose per-subprocess RSS in v1. The supervisor
      // tolerates `-1` as "unavailable" and skips memory enforcement
      // until cgroups land in v2.
      return -1;
    },
  };
  return handle;
};
