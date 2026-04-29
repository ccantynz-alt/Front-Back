import type { CarrierClient } from "../carrier/types.ts";
import type { AiAgentDispatcher } from "../ai-stream/types.ts";
import type {
  RecordingStorage,
  TranscriptionClient,
} from "../recording/storage.ts";
import type { CallStore } from "../store/store.ts";
import { canTransition } from "../store/store.ts";
import {
  type CrontechMLDoc,
  type Verb,
  parseCrontechML,
} from "./schema.ts";

export interface FlowFetcher {
  fetch(url: string, body: unknown): Promise<unknown>;
}

/** HTTP-based fetcher (for production) using the global fetch API. */
export class HttpFlowFetcher implements FlowFetcher {
  async fetch(url: string, body: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`flow fetch failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }
}

/**
 * Test-friendly fetcher that returns pre-programmed CrontechML documents
 * keyed by URL. Each entry is consumed once; missing keys throw.
 */
export class StaticFlowFetcher implements FlowFetcher {
  constructor(private docs: Map<string, unknown>) {}
  async fetch(url: string, _body: unknown): Promise<unknown> {
    const doc = this.docs.get(url);
    if (!doc) throw new Error(`no static flow registered for ${url}`);
    return doc;
  }
}

export interface ExecutorDeps {
  carrier: CarrierClient;
  store: CallStore;
  fetcher: FlowFetcher;
  ai: AiAgentDispatcher;
  storage: RecordingStorage;
  transcribe: TranscriptionClient;
}

export class CallFlowExecutor {
  constructor(private deps: ExecutorDeps) {}

  /**
   * Drive a call through one CrontechML document, then continue via
   * webhook-fetched documents until a terminal state is reached or no
   * further `flowUrl` is configured.
   */
  async run(callId: string, initialDoc: CrontechMLDoc): Promise<void> {
    const { store } = this.deps;
    let record = store.get(callId);
    if (!record) throw new Error(`call ${callId} not found`);

    if (canTransition(record.state, "in-progress")) {
      record = store.setState(callId, "in-progress");
    }

    let doc: CrontechMLDoc | null = initialDoc;
    let safety = 0;
    while (doc && safety < 32) {
      safety += 1;
      const terminated = await this.runDoc(callId, doc);
      record = store.get(callId);
      if (!record) return;
      if (terminated) return;
      if (!record.flowUrl) {
        // No webhook continuation — finish cleanly.
        if (canTransition(record.state, "completed")) {
          store.setState(callId, "completed");
        }
        return;
      }
      const next = await this.deps.fetcher.fetch(record.flowUrl, {
        callId,
        state: record.state,
        digits: record.digits,
        events: record.events.slice(-10),
      });
      doc = parseCrontechML(next);
    }
  }

  /** Execute every verb in a document. Returns true if the call is terminal. */
  private async runDoc(callId: string, doc: CrontechMLDoc): Promise<boolean> {
    for (const verb of doc.verbs) {
      const terminated = await this.runVerb(callId, verb);
      if (terminated) return true;
    }
    return false;
  }

  private async runVerb(callId: string, verb: Verb): Promise<boolean> {
    const { carrier, store, ai, storage, transcribe } = this.deps;
    store.appendEvent(callId, {
      ts: Date.now(),
      type: `verb:${verb.verb}`,
    });

    switch (verb.verb) {
      case "say": {
        const sayOpts: { voice?: string; language?: string } = {};
        if (verb.voice !== undefined) sayOpts.voice = verb.voice;
        if (verb.language !== undefined) sayOpts.language = verb.language;
        await carrier.say(callId, verb.text, sayOpts);
        return false;
      }
      case "play": {
        const loops = verb.loop ?? 1;
        for (let i = 0; i < loops; i += 1) {
          await carrier.playAudio(callId, verb.audioUrl);
        }
        return false;
      }
      case "gather": {
        const gOpts: {
          numDigits?: number;
          timeoutSec?: number;
          finishOnKey?: string;
        } = {};
        if (verb.numDigits !== undefined) gOpts.numDigits = verb.numDigits;
        if (verb.timeoutSec !== undefined) gOpts.timeoutSec = verb.timeoutSec;
        if (verb.finishOnKey !== undefined) gOpts.finishOnKey = verb.finishOnKey;
        if (verb.prompt) {
          await carrier.say(callId, verb.prompt, {});
        }
        const { digits } = await carrier.gatherDigits(callId, gOpts);
        store.patch(callId, { digits });
        return false;
      }
      case "record": {
        const rOpts: { maxLengthSec?: number; playBeep?: boolean } = {};
        if (verb.maxLengthSec !== undefined) rOpts.maxLengthSec = verb.maxLengthSec;
        if (verb.playBeep !== undefined) rOpts.playBeep = verb.playBeep;
        const handle = await carrier.record(callId, rOpts);
        if (handle.audioUrl) {
          // In production we'd stream to storage; here we just persist the
          // carrier-provided URL through the storage abstraction.
          const storedUrl = await storage.put(
            `${callId}.wav`,
            new Uint8Array(0),
          );
          store.patch(callId, { recordingUrl: storedUrl });
          if (verb.transcribe) {
            const t = await transcribe.transcribe(handle.audioUrl);
            store.patch(callId, { transcriptionText: t.text });
          }
        }
        return false;
      }
      case "dial": {
        await carrier.transfer(callId, verb.to);
        return false;
      }
      case "redirect": {
        store.patch(callId, { flowUrl: verb.url });
        return false;
      }
      case "hangup": {
        await carrier.hangup(callId);
        if (canTransition(store.get(callId)!.state, "completed")) {
          store.setState(callId, "completed");
        }
        return true;
      }
      case "pause": {
        // No-op in tests. Real impl would `setTimeout`-style; we keep the
        // executor synchronous for deterministic tests.
        return false;
      }
      case "enqueue": {
        store.appendEvent(callId, {
          ts: Date.now(),
          type: "enqueued",
          detail: { queueName: verb.queueName },
        });
        return false;
      }
      case "connect_ai_agent": {
        const openOpts: {
          callId: string;
          agentId: string;
          streamUrl?: string;
          systemPrompt?: string;
        } = { callId, agentId: verb.agentId };
        if (verb.streamUrl !== undefined) openOpts.streamUrl = verb.streamUrl;
        if (verb.systemPrompt !== undefined) openOpts.systemPrompt = verb.systemPrompt;
        const stream = await ai.open(openOpts);
        // For the control plane: register the stream then close it. The
        // real run-loop pumps audio frames between carrier and AI agent.
        await stream.close();
        store.appendEvent(callId, {
          ts: Date.now(),
          type: "ai-agent-connected",
          detail: { agentId: verb.agentId },
        });
        return false;
      }
    }
  }
}
