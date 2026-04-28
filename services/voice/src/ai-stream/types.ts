/**
 * Bidirectional audio-stream contract for `connect_ai_agent`.
 *
 * Real implementation routes audio frames between the carrier media
 * channel and services/comms-intelligence. Sub-300ms turn-taking is the
 * design target — frame size 20ms, jitter buffer 60ms, voice-activity
 * detection on the carrier side, half-duplex barge-in on the agent side.
 *
 * Agent 4 (services/comms-intelligence) implements the consumer side of
 * this contract; we mock it here so call-flow tests don't depend on it.
 */
export interface AudioFrame {
  /** Monotonic sequence number, starts at 0. */
  seq: number;
  /** PCM 16-bit little-endian, 8kHz mono frame (20ms = 320 bytes). */
  pcm: Uint8Array;
}

export interface AiAgentStream {
  send(frame: AudioFrame): Promise<void>;
  /**
   * Async iterator of frames coming back from the AI agent. Closing the
   * iterator (return) signals graceful shutdown.
   */
  receive(): AsyncIterable<AudioFrame>;
  close(): Promise<void>;
}

export interface AiAgentDispatcher {
  open(opts: {
    callId: string;
    agentId: string;
    streamUrl?: string;
    systemPrompt?: string;
  }): Promise<AiAgentStream>;
}

export class MockAiAgentStream implements AiAgentStream {
  sent: AudioFrame[] = [];
  closed = false;

  async send(frame: AudioFrame): Promise<void> {
    if (this.closed) throw new Error("stream closed");
    this.sent.push(frame);
  }

  receive(): AsyncIterable<AudioFrame> {
    return {
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (this.closed || i >= 1) return { value: undefined, done: true };
            i += 1;
            return {
              value: { seq: 0, pcm: new Uint8Array([0xff]) },
              done: false,
            };
          },
        };
      },
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export class MockAiAgentDispatcher implements AiAgentDispatcher {
  opened: Array<{
    callId: string;
    agentId: string;
    streamUrl?: string;
    systemPrompt?: string;
  }> = [];

  async open(opts: {
    callId: string;
    agentId: string;
    streamUrl?: string;
    systemPrompt?: string;
  }): Promise<AiAgentStream> {
    const entry: {
      callId: string;
      agentId: string;
      streamUrl?: string;
      systemPrompt?: string;
    } = {
      callId: opts.callId,
      agentId: opts.agentId,
    };
    if (opts.streamUrl !== undefined) entry.streamUrl = opts.streamUrl;
    if (opts.systemPrompt !== undefined) entry.systemPrompt = opts.systemPrompt;
    this.opened.push(entry);
    return new MockAiAgentStream();
  }
}
