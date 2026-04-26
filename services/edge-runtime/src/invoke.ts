// ── Crontech Edge Runtime — Per-invocation worker driver ────────────
// Spawns a worker, drives the init / invoke / response handshake, and
// rebuilds the worker's serialised response into a Web `Response` for
// the HTTP layer. Lives in its own file so `index.ts` can stay focused
// on routing.

import {
  type WorkerMessage,
  type WorkerReply,
  WorkerReplySchema,
  serialiseRequest,
} from "./dispatch";
import type { RegisteredBundle } from "./registry";

// ── Public types ────────────────────────────────────────────────────

export interface RuntimeWorker {
  postMessage(msg: WorkerMessage): void;
  onMessage(handler: (reply: WorkerReply) => void): void;
  terminate(): Promise<void> | void;
}

export type WorkerSpawner = () => RuntimeWorker;

// ── Default Bun Worker spawner ──────────────────────────────────────

export function defaultSpawnWorker(): RuntimeWorker {
  // Bun's Worker constructor is the only place we touch the actual
  // runtime sandbox. Everything else stays pure / mockable.
  const url = new URL("./worker-host.ts", import.meta.url);
  const worker = new Worker(url.href, { type: "module" });
  let listener: ((reply: WorkerReply) => void) | null = null;
  worker.onmessage = (ev: MessageEvent<unknown>): void => {
    if (listener === null) return;
    const parsed = WorkerReplySchema.safeParse(ev.data);
    if (!parsed.success) {
      listener({ type: "error", message: `invalid worker reply: ${parsed.error.message}` });
      return;
    }
    listener(parsed.data);
  };
  return {
    postMessage(msg) {
      worker.postMessage(msg);
    },
    onMessage(handler) {
      listener = handler;
    },
    terminate() {
      worker.terminate();
    },
  };
}

// ── Invocation driver ───────────────────────────────────────────────

export interface InvokeArgs {
  bundle: RegisteredBundle;
  request: Request;
  spawn: WorkerSpawner;
  timeoutMs: number;
}

export async function invokeBundle(args: InvokeArgs): Promise<Response> {
  const { bundle, request, spawn, timeoutMs } = args;
  const worker = spawn();
  const queue: WorkerReply[] = [];
  const waiters: ((reply: WorkerReply) => void)[] = [];

  worker.onMessage((reply) => {
    const next = waiters.shift();
    if (next) next(reply);
    else queue.push(reply);
  });

  const nextReply = (): Promise<WorkerReply> =>
    new Promise((resolve) => {
      const queued = queue.shift();
      if (queued) resolve(queued);
      else waiters.push(resolve);
    });

  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("worker timeout")), timeoutMs);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(t);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });

  try {
    worker.postMessage({ type: "init", code: bundle.code, entrypoint: bundle.entrypoint });
    const initReply = await withTimeout(nextReply());
    if (initReply.type === "error") {
      return new Response(`bundle init failed: ${initReply.message}`, { status: 500 });
    }
    if (initReply.type !== "ready") {
      return new Response("unexpected worker reply during init", { status: 500 });
    }

    const serialised = await serialiseRequest(request);
    worker.postMessage({ type: "invoke", request: serialised });
    const invokeReply = await withTimeout(nextReply());
    if (invokeReply.type === "error") {
      return new Response(`handler error: ${invokeReply.message}`, { status: 500 });
    }
    if (invokeReply.type !== "response") {
      return new Response("unexpected worker reply during invoke", { status: 500 });
    }

    const { response } = invokeReply;
    const headers = new Headers();
    for (const [k, v] of response.headers) headers.append(k, v);
    const body =
      response.bodyBase64.length === 0 ? null : Buffer.from(response.bodyBase64, "base64");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "dispatch failed";
    if (message === "worker timeout") {
      return new Response("gateway timeout", { status: 504 });
    }
    return new Response(`dispatch error: ${message}`, { status: 500 });
  } finally {
    await worker.terminate();
  }
}
