// ── Crontech Edge Runtime — Worker Host ─────────────────────────────
// Runs inside a Bun Worker. The parent process posts an `init` message
// with the bundle's source code, then an `invoke` message per request.
// We evaluate the bundle, grab its default-exported handler, run it
// against a deserialised `Request`, and post a serialised `Response`
// back to the parent.
//
// ⚠️  v0 isolation trade-off (read carefully):
//
//   v0 uses Bun Worker threads as the sandbox primitive. **Bun Workers
//   are NOT V8 isolates.** They share a process with the parent and
//   their isolation guarantees are weaker than what real V8 isolates
//   provide. A misbehaving bundle CAN, in principle, exhaust the
//   shared host's memory or saturate the event loop on the worker
//   thread. We accept this for v0 because:
//
//     1. Bundles in v0 are uploaded by trusted operators (the deploy
//        agent), not arbitrary tenants.
//     2. Bun Workers are the highest-fidelity primitive Bun ships
//        today — moving to true V8 isolates means a Rust harness or
//        `isolated-vm` (which doesn't run on Bun yet).
//     3. v1 replaces this file's worker host with a real V8 isolate
//        harness. The wire protocol (init / invoke / response / error)
//        is designed so the swap is contained to this file plus the
//        spawn site in index.ts.
//
//   Until v1 lands, treat the v0 runtime as "self-hosted, single-tenant,
//   trusted-operator". See `docs/EDGE_RUNTIME_V0.md` for the full
//   roadmap.

/// <reference lib="webworker" />

import {
  WorkerMessageSchema,
  type SerialisedResponse,
  type WorkerMessage,
  type WorkerReply,
  deserialiseRequest,
  serialiseResponse,
} from "./dispatch";

declare const self: {
  postMessage(msg: WorkerReply): void;
  onmessage: ((ev: MessageEvent<unknown>) => void) | null;
  close(): void;
};

type BundleHandler = (req: Request) => Response | Promise<Response>;

interface BundleModule {
  default?: BundleHandler;
  fetch?: BundleHandler;
}

let handler: BundleHandler | null = null;

/**
 * Evaluate a bundle's source string and resolve its default handler.
 *
 * The bundle is evaluated as an ES module (data URL) so `export default`
 * works the way the rest of the platform writes handlers.
 */
async function loadBundle(code: string, entrypoint: string): Promise<BundleHandler> {
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`;
  const mod = (await import(dataUrl)) as BundleModule;
  const candidate = mod.default ?? mod.fetch;
  if (typeof candidate !== "function") {
    throw new Error(
      `bundle "${entrypoint}" did not export a default handler (got ${typeof candidate})`,
    );
  }
  return candidate;
}

async function handleMessage(raw: unknown): Promise<void> {
  let msg: WorkerMessage;
  try {
    msg = WorkerMessageSchema.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid worker message";
    self.postMessage({ type: "error", message });
    return;
  }

  if (msg.type === "init") {
    try {
      handler = await loadBundle(msg.code, msg.entrypoint);
      self.postMessage({ type: "ready" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "bundle load failed";
      self.postMessage({ type: "error", message });
    }
    return;
  }

  if (msg.type === "invoke") {
    if (handler === null) {
      self.postMessage({ type: "error", message: "worker received invoke before init" });
      return;
    }
    try {
      const req = deserialiseRequest(msg.request);
      const res = await handler(req);
      const serialised: SerialisedResponse = await serialiseResponse(res);
      self.postMessage({ type: "response", response: serialised });
    } catch (err) {
      const message = err instanceof Error ? err.message : "handler threw";
      self.postMessage({ type: "error", message });
    }
    return;
  }
}

self.onmessage = (ev: MessageEvent<unknown>): void => {
  void handleMessage(ev.data);
};
