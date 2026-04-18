// ── Process Manager ───────────────────────────────────────────────────
// Manages child processes for deployed apps. Handles port allocation,
// process lifecycle, health monitoring, auto-restart, and log capture.

import type { Subprocess } from "bun";
import type { LogEntry, PortAllocation } from "./types";

const PORT_RANGE_START = 8100;
const PORT_RANGE_END = 8999;
const LOG_BUFFER_SIZE = 1000;
const HEALTH_CHECK_INTERVAL_MS = 15_000;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_BASE_MS = 1_000;

interface ManagedProcess {
  appName: string;
  process: Subprocess | null;
  port: number;
  command: string[];
  cwd: string;
  env: Record<string, string>;
  logs: LogEntry[];
  restartCount: number;
  lastStartedAt: string;
  healthCheckTimer: ReturnType<typeof setInterval> | null;
  draining: boolean;
}

const processes = new Map<string, ManagedProcess>();
const allocatedPorts = new Map<number, string>();

function appendLog(
  managed: ManagedProcess,
  stream: LogEntry["stream"],
  message: string,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    stream,
    message,
  };
  managed.logs.push(entry);
  if (managed.logs.length > LOG_BUFFER_SIZE) {
    managed.logs.splice(0, managed.logs.length - LOG_BUFFER_SIZE);
  }
}

function pipeStream(
  readable: ReadableStream<Uint8Array> | null,
  managed: ManagedProcess,
  stream: LogEntry["stream"],
): void {
  if (!readable) return;

  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function read(): void {
    reader
      .read()
      .then(({ done, value }) => {
        if (done) return;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.length > 0) {
            appendLog(managed, stream, line);
          }
        }

        read();
      })
      .catch(() => {
        if (buffer.length > 0) {
          appendLog(managed, stream, buffer);
          buffer = "";
        }
      });
  }

  read();
}

export function allocatePort(appName: string): number {
  for (const [port, owner] of allocatedPorts) {
    if (owner === appName) return port;
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!allocatedPorts.has(port)) {
      allocatedPorts.set(port, appName);
      return port;
    }
  }

  throw new Error(
    `Port pool exhausted (${PORT_RANGE_START}-${PORT_RANGE_END}). ${allocatedPorts.size} ports allocated.`,
  );
}

export function releasePort(appName: string): void {
  for (const [port, owner] of allocatedPorts) {
    if (owner === appName) {
      allocatedPorts.delete(port);
      return;
    }
  }
}

export function getPortForApp(appName: string): number | undefined {
  for (const [port, owner] of allocatedPorts) {
    if (owner === appName) return port;
  }
  return undefined;
}

export function getAllPortAllocations(): PortAllocation[] {
  const result: PortAllocation[] = [];
  for (const [port, appName] of allocatedPorts) {
    result.push({
      port,
      appName,
      allocatedAt: processes.get(appName)?.lastStartedAt ?? new Date().toISOString(),
    });
  }
  return result;
}

function spawnProcess(managed: ManagedProcess): Subprocess {
  appendLog(
    managed,
    "system",
    `Starting process: ${managed.command.join(" ")}`,
  );

  const proc = Bun.spawn(managed.command, {
    cwd: managed.cwd,
    env: {
      ...process.env,
      ...managed.env,
      PORT: String(managed.port),
      NODE_ENV: "production",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  pipeStream(proc.stdout as ReadableStream<Uint8Array>, managed, "stdout");
  pipeStream(proc.stderr as ReadableStream<Uint8Array>, managed, "stderr");

  proc.exited
    .then((exitCode) => {
      if (managed.draining) return;

      appendLog(
        managed,
        "system",
        `Process exited with code ${exitCode}`,
      );

      if (managed.restartCount < MAX_RESTART_ATTEMPTS) {
        const backoff =
          RESTART_BACKOFF_BASE_MS * Math.pow(2, managed.restartCount);
        appendLog(
          managed,
          "system",
          `Auto-restarting in ${backoff}ms (attempt ${managed.restartCount + 1}/${MAX_RESTART_ATTEMPTS})`,
        );

        setTimeout(() => {
          if (managed.draining) return;
          managed.restartCount++;
          managed.process = spawnProcess(managed);
          managed.lastStartedAt = new Date().toISOString();
        }, backoff);
      } else {
        appendLog(
          managed,
          "system",
          `Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Process will not be restarted.`,
        );
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "unknown error";
      appendLog(managed, "system", `Process error: ${msg}`);
    });

  return proc;
}

function startHealthCheck(managed: ManagedProcess): void {
  stopHealthCheck(managed);

  managed.healthCheckTimer = setInterval(async () => {
    if (managed.draining || !managed.process) return;

    try {
      const res = await fetch(
        `http://127.0.0.1:${managed.port}/health`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) {
        appendLog(
          managed,
          "system",
          `Health check returned ${res.status}`,
        );
      }
    } catch {
      appendLog(
        managed,
        "system",
        "Health check failed (connection refused or timeout)",
      );
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  if (
    typeof (managed.healthCheckTimer as unknown as { unref?: () => void })
      .unref === "function"
  ) {
    (managed.healthCheckTimer as unknown as { unref: () => void }).unref();
  }
}

function stopHealthCheck(managed: ManagedProcess): void {
  if (managed.healthCheckTimer) {
    clearInterval(managed.healthCheckTimer);
    managed.healthCheckTimer = null;
  }
}

export function startProcess(
  appName: string,
  command: string[],
  cwd: string,
  env: Record<string, string>,
  port: number,
): void {
  const existing = processes.get(appName);
  if (existing) {
    stopProcess(appName);
  }

  const managed: ManagedProcess = {
    appName,
    process: null,
    port,
    command,
    cwd,
    env,
    logs: [],
    restartCount: 0,
    lastStartedAt: new Date().toISOString(),
    healthCheckTimer: null,
    draining: false,
  };

  managed.process = spawnProcess(managed);
  processes.set(appName, managed);
  startHealthCheck(managed);
}

export function stopProcess(appName: string): void {
  const managed = processes.get(appName);
  if (!managed) return;

  managed.draining = true;
  stopHealthCheck(managed);

  if (managed.process) {
    appendLog(managed, "system", "Stopping process (SIGTERM)");
    managed.process.kill("SIGTERM");

    setTimeout(() => {
      if (managed.process && !managed.process.killed) {
        appendLog(managed, "system", "Process did not exit, sending SIGKILL");
        managed.process.kill("SIGKILL");
      }
    }, 10_000);
  }

  processes.delete(appName);
}

export function restartProcess(appName: string): void {
  const managed = processes.get(appName);
  if (!managed) {
    throw new Error(`No process found for app "${appName}"`);
  }

  const { command, cwd, env, port } = managed;
  stopProcess(appName);
  startProcess(appName, command, cwd, env, port);
}

export function isProcessRunning(appName: string): boolean {
  const managed = processes.get(appName);
  if (!managed?.process) return false;
  return !managed.process.killed;
}

export function getProcessPid(appName: string): number | undefined {
  const managed = processes.get(appName);
  return managed?.process?.pid;
}

export function getProcessLogs(appName: string, tail: number): LogEntry[] {
  const managed = processes.get(appName);
  if (!managed) return [];
  if (tail >= managed.logs.length) return [...managed.logs];
  return managed.logs.slice(-tail);
}

export function streamProcessLogs(appName: string): ReadableStream<string> {
  const managed = processes.get(appName);
  const encoder = new TextEncoder();

  return new ReadableStream<string>({
    start(controller) {
      if (!managed) {
        controller.enqueue(
          `data: ${JSON.stringify({ error: `No process found for "${appName}"` })}\n\n`,
        );
        controller.close();
        return;
      }

      for (const entry of managed.logs) {
        controller.enqueue(`data: ${JSON.stringify(entry)}\n\n`);
      }

      const initialLength = managed.logs.length;
      let lastSent = initialLength;

      const interval = setInterval(() => {
        if (!processes.has(appName)) {
          controller.enqueue(
            `data: ${JSON.stringify({ stream: "system", message: "Process stopped", timestamp: new Date().toISOString() })}\n\n`,
          );
          clearInterval(interval);
          controller.close();
          return;
        }

        const currentLogs = managed.logs;
        while (lastSent < currentLogs.length) {
          const entry = currentLogs[lastSent];
          if (entry) {
            controller.enqueue(`data: ${JSON.stringify(entry)}\n\n`);
          }
          lastSent++;
        }
      }, 500);

      void encoder;
    },
  });
}

export function listManagedProcesses(): Array<{
  appName: string;
  pid: number | undefined;
  port: number;
  running: boolean;
  restartCount: number;
  lastStartedAt: string;
  logCount: number;
}> {
  const result: Array<{
    appName: string;
    pid: number | undefined;
    port: number;
    running: boolean;
    restartCount: number;
    lastStartedAt: string;
    logCount: number;
  }> = [];

  for (const [appName, managed] of processes) {
    result.push({
      appName,
      pid: managed.process?.pid,
      port: managed.port,
      running: managed.process ? !managed.process.killed : false,
      restartCount: managed.restartCount,
      lastStartedAt: managed.lastStartedAt,
      logCount: managed.logs.length,
    });
  }

  return result;
}

export function stopAllProcesses(): void {
  for (const appName of processes.keys()) {
    stopProcess(appName);
  }
  allocatedPorts.clear();
}
