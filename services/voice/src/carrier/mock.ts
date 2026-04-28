import type {
  CarrierClient,
  OriginateOptions,
  RecordingHandle,
} from "./types.ts";

interface MockEvent {
  ts: number;
  call: string;
  op: string;
  detail?: Record<string, unknown>;
}

/**
 * In-memory carrier mock used in tests AND as the default in dev when a
 * real carrier is not configured. Records every operation so tests can
 * assert against the exact carrier call sequence.
 */
export class MockCarrier implements CarrierClient {
  events: MockEvent[] = [];
  // Pre-program responses for digit gathering, e.g. queue["call-1"] = "42#"
  digitResponses = new Map<string, string>();
  // Pre-program responses for recording start
  recordingResponses = new Map<string, RecordingHandle>();
  // Force errors for resilience tests
  failMode: { op: string; callId: string } | undefined;

  private logEvent(call: string, op: string, detail?: Record<string, unknown>) {
    this.events.push({ ts: Date.now(), call, op, ...(detail ? { detail } : {}) });
  }

  private maybeFail(op: string, callId: string) {
    if (this.failMode && this.failMode.op === op && this.failMode.callId === callId) {
      throw new Error(`mock carrier forced failure: ${op}`);
    }
  }

  async originateCall(opts: OriginateOptions): Promise<{ carrierCallId: string }> {
    this.maybeFail("originate", opts.callId);
    this.logEvent(opts.callId, "originate", {
      from: opts.from,
      to: opts.to,
      answerUrl: opts.answerUrl,
    });
    return { carrierCallId: `carrier-${opts.callId}` };
  }

  async hangup(callId: string): Promise<void> {
    this.maybeFail("hangup", callId);
    this.logEvent(callId, "hangup");
  }

  async transfer(callId: string, to: string): Promise<void> {
    this.maybeFail("transfer", callId);
    this.logEvent(callId, "transfer", { to });
  }

  async playAudio(callId: string, audioUrl: string): Promise<void> {
    this.maybeFail("play", callId);
    this.logEvent(callId, "play", { audioUrl });
  }

  async gatherDigits(
    callId: string,
    opts: { numDigits?: number; timeoutSec?: number; finishOnKey?: string },
  ): Promise<{ digits: string }> {
    this.maybeFail("gather", callId);
    this.logEvent(callId, "gather", { ...opts });
    const digits = this.digitResponses.get(callId) ?? "";
    return { digits };
  }

  async record(
    callId: string,
    opts: { maxLengthSec?: number; playBeep?: boolean },
  ): Promise<RecordingHandle> {
    this.maybeFail("record", callId);
    this.logEvent(callId, "record", { ...opts });
    const preset = this.recordingResponses.get(callId);
    if (preset) return preset;
    return {
      recordingId: `rec-${callId}`,
      status: "completed",
      audioUrl: `mock-storage://recordings/${callId}.wav`,
    };
  }

  async say(
    callId: string,
    text: string,
    opts: { voice?: string; language?: string },
  ): Promise<void> {
    this.maybeFail("say", callId);
    this.logEvent(callId, "say", { text, ...opts });
  }
}
