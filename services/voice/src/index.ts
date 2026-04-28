/**
 * Voice / SIP control plane — entry point.
 *
 * Wires the in-memory dev defaults: mock carrier, mock storage, mock
 * AI dispatcher. In production, real implementations are injected at
 * the boundary; the rest of the system is identical.
 */
import { MockCarrier } from "./carrier/mock.ts";
import { MockAiAgentDispatcher } from "./ai-stream/types.ts";
import {
  MockRecordingStorage,
  MockTranscriptionClient,
} from "./recording/storage.ts";
import { CallStore } from "./store/store.ts";
import { CallQuota, DEFAULT_QUOTA } from "./quota/quota.ts";
import { HttpFlowFetcher } from "./flow/executor.ts";
import { VoiceApi } from "./rest/api.ts";
import { createHttpHandler } from "./rest/http.ts";

export { MockCarrier } from "./carrier/mock.ts";
export type {
  CarrierClient,
  OriginateOptions,
  RecordingHandle,
} from "./carrier/types.ts";
export {
  type CrontechMLDoc,
  type Verb,
  type CallRecord,
  type CallState,
  parseCrontechML,
} from "./flow/schema.ts";
export {
  CallFlowExecutor,
  HttpFlowFetcher,
  StaticFlowFetcher,
  type FlowFetcher,
} from "./flow/executor.ts";
export { CallStore, canTransition } from "./store/store.ts";
export { CallQuota, DEFAULT_QUOTA } from "./quota/quota.ts";
export { VoiceApi } from "./rest/api.ts";
export { createHttpHandler } from "./rest/http.ts";
export {
  type AiAgentDispatcher,
  type AiAgentStream,
  type AudioFrame,
  MockAiAgentDispatcher,
  MockAiAgentStream,
} from "./ai-stream/types.ts";
export {
  type RecordingStorage,
  type TranscriptionClient,
  MockRecordingStorage,
  MockTranscriptionClient,
} from "./recording/storage.ts";

if (import.meta.main) {
  const port = Number(process.env["PORT"] ?? 8080);
  const authToken = process.env["VOICE_TOKEN"] ?? "dev-token";

  const carrier = new MockCarrier();
  const store = new CallStore();
  const quota = new CallQuota(DEFAULT_QUOTA);
  const fetcher = new HttpFlowFetcher();
  const ai = new MockAiAgentDispatcher();
  const storage = new MockRecordingStorage();
  const transcribe = new MockTranscriptionClient();

  const api = new VoiceApi({
    carrier,
    store,
    quota,
    fetcher,
    ai,
    storage,
    transcribe,
    authToken,
    inboundFlowResolver: async (_to) => null,
  });
  const handler = createHttpHandler(api);

  Bun.serve({ port, fetch: handler });
  console.log(`voice control plane listening on :${port}`);
}
