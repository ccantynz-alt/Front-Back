// ── git-webhook · public entry point ────────────────────────────────────
//
// Re-exports the small surface area that downstream services and tests
// need. The HTTP server itself lives in `./server` so that consumers
// embedding the receiver in another process (for example, the deploy
// orchestrator) can import the factory without spinning up a server.

export {
  createReceiver,
  SERVICE_NAME,
  SERVICE_VERSION,
  DEFAULT_REPLAY_WINDOW_MS,
  type Receiver,
  type ReceiverOptions,
} from "./receiver";
export {
  BuildRequestedSchema,
  TenantWebhookConfigSchema,
  PushPayloadSchema,
  type BuildRequested,
  type TenantWebhookConfig,
  type PushPayload,
  type BranchEnvironmentMap,
} from "./schemas";
export {
  InMemoryTenantConfigStore,
  resolveEnvironment,
  type TenantConfigStore,
} from "./tenants";
export { InMemoryDedupStore, type DedupStore } from "./dedup";
export {
  InProcessTransport,
  HttpFanoutTransport,
  type BuildRequestTransport,
  type TransportResult,
  type TransportFailure,
  type InProcessListener,
} from "./transport";
export { computeSignature, verifySignature } from "./hmac";
