import { z } from "zod";
import { CallFlowExecutor, type FlowFetcher } from "../flow/executor.ts";
import { type CallRecord, parseCrontechML } from "../flow/schema.ts";
import { CallStore, canTransition } from "../store/store.ts";
import { CallQuota } from "../quota/quota.ts";
import type { CarrierClient } from "../carrier/types.ts";
import type { AiAgentDispatcher } from "../ai-stream/types.ts";
import type {
  RecordingStorage,
  TranscriptionClient,
} from "../recording/storage.ts";

export interface VoiceApiDeps {
  carrier: CarrierClient;
  store: CallStore;
  quota: CallQuota;
  fetcher: FlowFetcher;
  ai: AiAgentDispatcher;
  storage: RecordingStorage;
  transcribe: TranscriptionClient;
  authToken: string;
  /** Resolves a tenant's inbound flow URL given a phone number. */
  inboundFlowResolver: (toNumber: string) => Promise<{
    tenantId: string;
    flowUrl: string;
  } | null>;
  idGenerator?: () => string;
}

const OriginateBody = z.object({
  from: z.string().min(3),
  to: z.string().min(3),
  flowUrl: z.string().url(),
  statusWebhook: z.string().url().optional(),
  tenantId: z.string().min(1),
});

const TransferBody = z.object({ to: z.string().min(3) });
const PlayBody = z.object({ audioUrl: z.string().url() });
const InboundBody = z.object({
  carrierCallId: z.string().min(1),
  from: z.string().min(3),
  to: z.string().min(3),
});

export interface ApiResponse {
  status: number;
  body: unknown;
}

function ok(body: unknown): ApiResponse {
  return { status: 200, body };
}

function err(status: number, message: string): ApiResponse {
  return { status, body: { error: message } };
}

/**
 * Carrier-agnostic REST API. Pure function-style for trivial testing
 * (no HTTP framework dependency leaks into call-flow logic).
 */
export class VoiceApi {
  private executor: CallFlowExecutor;

  constructor(private deps: VoiceApiDeps) {
    this.executor = new CallFlowExecutor({
      carrier: deps.carrier,
      store: deps.store,
      fetcher: deps.fetcher,
      ai: deps.ai,
      storage: deps.storage,
      transcribe: deps.transcribe,
    });
  }

  private auth(token: string | null): boolean {
    if (!this.deps.authToken) return false;
    return token === `Bearer ${this.deps.authToken}`;
  }

  private nextId(): string {
    if (this.deps.idGenerator) return this.deps.idGenerator();
    return `call_${Math.random().toString(36).slice(2, 12)}`;
  }

  async originate(token: string | null, raw: unknown): Promise<ApiResponse> {
    if (!this.auth(token)) return err(401, "unauthorized");
    const parsed = OriginateBody.safeParse(raw);
    if (!parsed.success) return err(400, "invalid body");
    const body = parsed.data;
    if (!this.deps.quota.consume(body.tenantId)) {
      return err(429, "quota exceeded");
    }
    const id = this.nextId();
    const now = Date.now();
    const record: CallRecord = {
      id,
      tenantId: body.tenantId,
      from: body.from,
      to: body.to,
      direction: "outbound",
      state: "queued",
      flowUrl: body.flowUrl,
      ...(body.statusWebhook !== undefined
        ? { statusWebhook: body.statusWebhook }
        : {}),
      createdAt: now,
      updatedAt: now,
      events: [{ ts: now, type: "created" }],
    };
    this.deps.store.insert(record);

    try {
      this.deps.store.setState(id, "dialing");
      await this.deps.carrier.originateCall({
        callId: id,
        from: body.from,
        to: body.to,
        answerUrl: body.flowUrl,
      });
      this.deps.store.setState(id, "ringing");
      this.deps.store.setState(id, "answered");
      const initialDoc = parseCrontechML(
        await this.deps.fetcher.fetch(body.flowUrl, {
          callId: id,
          state: "answered",
        }),
      );
      await this.executor.run(id, initialDoc);
    } catch (e) {
      const r = this.deps.store.get(id);
      if (r && canTransition(r.state, "failed")) {
        this.deps.store.setState(id, "failed");
      }
      return err(502, `carrier error: ${(e as Error).message}`);
    }

    return ok({ id, state: this.deps.store.get(id)?.state });
  }

  async getCall(token: string | null, id: string): Promise<ApiResponse> {
    if (!this.auth(token)) return err(401, "unauthorized");
    const r = this.deps.store.get(id);
    if (!r) return err(404, "call not found");
    return ok(r);
  }

  async hangup(token: string | null, id: string): Promise<ApiResponse> {
    if (!this.auth(token)) return err(401, "unauthorized");
    const r = this.deps.store.get(id);
    if (!r) return err(404, "call not found");
    await this.deps.carrier.hangup(id);
    if (canTransition(r.state, "completed")) {
      this.deps.store.setState(id, "completed");
    }
    return ok({ id, state: this.deps.store.get(id)?.state });
  }

  async transferCall(
    token: string | null,
    id: string,
    raw: unknown,
  ): Promise<ApiResponse> {
    if (!this.auth(token)) return err(401, "unauthorized");
    const parsed = TransferBody.safeParse(raw);
    if (!parsed.success) return err(400, "invalid body");
    const r = this.deps.store.get(id);
    if (!r) return err(404, "call not found");
    await this.deps.carrier.transfer(id, parsed.data.to);
    return ok({ id, transferredTo: parsed.data.to });
  }

  async play(
    token: string | null,
    id: string,
    raw: unknown,
  ): Promise<ApiResponse> {
    if (!this.auth(token)) return err(401, "unauthorized");
    const parsed = PlayBody.safeParse(raw);
    if (!parsed.success) return err(400, "invalid body");
    const r = this.deps.store.get(id);
    if (!r) return err(404, "call not found");
    await this.deps.carrier.playAudio(id, parsed.data.audioUrl);
    return ok({ id });
  }

  async inbound(token: string | null, raw: unknown): Promise<ApiResponse> {
    if (!this.auth(token)) return err(401, "unauthorized");
    const parsed = InboundBody.safeParse(raw);
    if (!parsed.success) return err(400, "invalid body");
    const body = parsed.data;
    const resolved = await this.deps.inboundFlowResolver(body.to);
    if (!resolved) return err(404, "no inbound flow configured");
    if (!this.deps.quota.consume(resolved.tenantId)) {
      return err(429, "quota exceeded");
    }
    const id = this.nextId();
    const now = Date.now();
    const record: CallRecord = {
      id,
      tenantId: resolved.tenantId,
      from: body.from,
      to: body.to,
      direction: "inbound",
      state: "answered",
      flowUrl: resolved.flowUrl,
      createdAt: now,
      updatedAt: now,
      events: [{ ts: now, type: "inbound-arrived" }],
    };
    this.deps.store.insert(record);

    try {
      const initialDoc = parseCrontechML(
        await this.deps.fetcher.fetch(resolved.flowUrl, {
          callId: id,
          state: "answered",
          from: body.from,
          to: body.to,
        }),
      );
      await this.executor.run(id, initialDoc);
    } catch (e) {
      const r = this.deps.store.get(id);
      if (r && canTransition(r.state, "failed")) {
        this.deps.store.setState(id, "failed");
      }
      return err(502, `inbound flow error: ${(e as Error).message}`);
    }

    return ok({ id, state: this.deps.store.get(id)?.state });
  }
}
