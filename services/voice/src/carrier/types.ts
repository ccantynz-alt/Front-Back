/**
 * Carrier-agnostic SIP-trunk provider interface.
 *
 * Concrete implementations talk to Twilio Elastic SIP, Bandwidth, Telnyx,
 * or any compatible carrier. The control plane only depends on this
 * interface, which keeps us free to swap providers without rewriting
 * call-flow logic.
 */
export interface OriginateOptions {
  callId: string;
  from: string;
  to: string;
  // The carrier will hit this URL once the leg is answered to fetch the
  // first CrontechML document. The control plane resolves it to a flowUrl.
  answerUrl: string;
  timeoutSec?: number;
}

export interface RecordingHandle {
  recordingId: string;
  status: "in-progress" | "completed" | "failed";
  audioUrl?: string;
}

export interface CarrierClient {
  originateCall(opts: OriginateOptions): Promise<{ carrierCallId: string }>;
  hangup(callId: string): Promise<void>;
  transfer(callId: string, to: string): Promise<void>;
  playAudio(callId: string, audioUrl: string): Promise<void>;
  gatherDigits(
    callId: string,
    opts: { numDigits?: number; timeoutSec?: number; finishOnKey?: string },
  ): Promise<{ digits: string }>;
  record(
    callId: string,
    opts: { maxLengthSec?: number; playBeep?: boolean },
  ): Promise<RecordingHandle>;
  say(
    callId: string,
    text: string,
    opts: { voice?: string; language?: string },
  ): Promise<void>;
}
