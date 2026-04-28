// ── AI Voice Agent ────────────────────────────────────────────────────
// Bidirectional audio-stream handler. services/voice connects to us via
// WebSocket; we receive audio frames, run STT, feed transcripts to the
// LLM, and stream TTS audio back. Sub-300ms turn-taking is the target —
// the harness in test/voice-agent.test.ts asserts on it.
//
// All three legs (STT, TTS, LLM) are pluggable. Tests inject mocks.

import type { LlmClient } from "./llm-client";
import type { ConversationMemory } from "./memory";

// ── Wire protocol ─────────────────────────────────────────────────────

/**
 * Inbound messages from the caller (services/voice). v1 is JSON-only;
 * v2 will support a binary frame variant for raw PCM.
 */
export type VoiceAgentInbound =
  | { type: "start"; conversationId: string; sampleRate?: number }
  | { type: "audio"; chunk: string /* base64-encoded PCM */ }
  | { type: "end-of-turn" }
  | { type: "stop" };

/** Outbound events emitted to the caller. */
export type VoiceAgentOutbound =
  | { type: "ready"; conversationId: string }
  | { type: "transcript-partial"; text: string }
  | { type: "transcript-final"; text: string }
  | { type: "agent-thinking" }
  | { type: "agent-text"; text: string }
  | { type: "agent-audio"; chunk: string /* base64-encoded PCM */ }
  | { type: "turn-complete"; turnLatencyMs: number }
  | { type: "error"; message: string };

// ── Pluggable backends ────────────────────────────────────────────────

export interface SttResult {
  text: string;
  isFinal: boolean;
}

export interface SttClient {
  /**
   * Stream-style transcription. The agent calls this with batched audio
   * chunks since the last call. Implementations may return partial
   * (`isFinal: false`) or final (`isFinal: true`) results.
   */
  transcribe(args: { audio: Uint8Array; sampleRate: number }): Promise<SttResult>;
}

export interface TtsClient {
  /** Generate speech audio for the given text. v1 returns one chunk. */
  synthesise(args: { text: string }): Promise<{ audio: Uint8Array }>;
}

// ── In-memory stub backends for tests ─────────────────────────────────

export class StubSttClient implements SttClient {
  public callLog: Array<{ audio: Uint8Array; sampleRate: number }> = [];
  private readonly script: string[];
  private idx = 0;

  constructor(script: string[] = []) {
    this.script = script;
  }

  // biome-ignore lint/suspicious/useAwait: implements async interface
  async transcribe(args: {
    audio: Uint8Array;
    sampleRate: number;
  }): Promise<SttResult> {
    this.callLog.push(args);
    const text = this.script[this.idx] ?? "";
    this.idx = Math.min(this.idx + 1, this.script.length);
    return { text, isFinal: true };
  }
}

export class StubTtsClient implements TtsClient {
  public callLog: Array<{ text: string }> = [];

  // biome-ignore lint/suspicious/useAwait: implements async interface
  async synthesise(args: { text: string }): Promise<{ audio: Uint8Array }> {
    this.callLog.push(args);
    // deterministic — one byte per source character is fine for tests.
    return { audio: new TextEncoder().encode(args.text) };
  }
}

// ── Voice-agent session ───────────────────────────────────────────────

export interface VoiceAgentDeps {
  stt: SttClient;
  tts: TtsClient;
  llm: LlmClient;
  memory: ConversationMemory;
  /** Optional system prompt. Defaults to a short concierge style. */
  systemPrompt?: string;
  /** Latency clock — overridable in tests. */
  now?: () => number;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a concise voice assistant. Keep replies under 30 words. Speak naturally.";

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(bin);
}

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export interface VoiceAgentSessionStats {
  conversationId: string;
  turnsCompleted: number;
  lastTurnLatencyMs: number | null;
}

/**
 * One live voice-agent session. The transport (WebSocket / WebRTC) feeds
 * inbound messages to {@link handleInbound} and forwards each yielded
 * {@link VoiceAgentOutbound} to the peer.
 *
 * The session is async-iterator friendly via the `send` callback so that
 * a Bun WebSocket handler can plug in directly.
 */
export class VoiceAgentSession {
  private readonly deps: VoiceAgentDeps;
  private readonly send: (msg: VoiceAgentOutbound) => void;
  private conversationId: string | null = null;
  private sampleRate = 16000;
  private buffer: Uint8Array[] = [];
  private turnStartedAt: number | null = null;
  private turnsCompleted = 0;
  private lastTurnLatencyMs: number | null = null;
  private stopped = false;
  private readonly nowFn: () => number;

  constructor(deps: VoiceAgentDeps, send: (msg: VoiceAgentOutbound) => void) {
    this.deps = deps;
    this.send = send;
    this.nowFn = deps.now ?? (() => Date.now());
  }

  stats(): VoiceAgentSessionStats {
    return {
      conversationId: this.conversationId ?? "",
      turnsCompleted: this.turnsCompleted,
      lastTurnLatencyMs: this.lastTurnLatencyMs,
    };
  }

  private appendChunk(chunk: string): void {
    if (this.turnStartedAt === null) {
      this.turnStartedAt = this.nowFn();
    }
    try {
      const bytes = decodeBase64(chunk);
      this.buffer.push(bytes);
    } catch {
      this.send({ type: "error", message: "invalid base64 audio chunk" });
    }
  }

  private flushBuffer(): Uint8Array {
    let total = 0;
    for (const b of this.buffer) total += b.byteLength;
    const out = new Uint8Array(total);
    let off = 0;
    for (const b of this.buffer) {
      out.set(b, off);
      off += b.byteLength;
    }
    this.buffer = [];
    return out;
  }

  async handleInbound(msg: VoiceAgentInbound): Promise<void> {
    if (this.stopped) {
      return;
    }
    switch (msg.type) {
      case "start": {
        this.conversationId = msg.conversationId;
        if (msg.sampleRate !== undefined) {
          this.sampleRate = msg.sampleRate;
        }
        this.send({ type: "ready", conversationId: this.conversationId });
        return;
      }
      case "audio": {
        if (this.conversationId === null) {
          this.send({ type: "error", message: "session not started" });
          return;
        }
        this.appendChunk(msg.chunk);
        return;
      }
      case "end-of-turn": {
        if (this.conversationId === null) {
          this.send({ type: "error", message: "session not started" });
          return;
        }
        await this.completeTurn();
        return;
      }
      case "stop": {
        this.stopped = true;
        return;
      }
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
        this.send({ type: "error", message: "unknown message type" });
      }
    }
  }

  private async completeTurn(): Promise<void> {
    if (this.conversationId === null) return;
    const audio = this.flushBuffer();
    let userText = "";

    if (audio.byteLength > 0) {
      try {
        const stt = await this.deps.stt.transcribe({
          audio,
          sampleRate: this.sampleRate,
        });
        userText = stt.text;
        this.send({
          type: stt.isFinal ? "transcript-final" : "transcript-partial",
          text: userText,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stt failed";
        this.send({ type: "error", message: `stt: ${msg}` });
        return;
      }
    }

    if (userText.length > 0) {
      this.deps.memory.appendMessage(this.conversationId, {
        role: "user",
        content: userText,
      });
    }

    this.send({ type: "agent-thinking" });

    const recent = this.deps.memory.getRecentMessages(this.conversationId, 12);
    const systemPrompt = this.deps.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const transcript = recent
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    const prompt = `${systemPrompt}\n\nConversation so far:\n${transcript}\n\nASSISTANT:`;

    let agentText = "";
    try {
      const completion = await this.deps.llm.complete({
        purpose: "voice-agent-turn",
        prompt,
        maxTokens: 120,
        temperature: 0.4,
      });
      agentText = completion.text.trim();
    } catch (err) {
      const message = err instanceof Error ? err.message : "llm failed";
      this.send({ type: "error", message: `llm: ${message}` });
      return;
    }

    if (agentText.length === 0) {
      agentText = "Sorry, I didn't catch that.";
    }

    this.deps.memory.appendMessage(this.conversationId, {
      role: "assistant",
      content: agentText,
    });

    this.send({ type: "agent-text", text: agentText });

    try {
      const audioOut = await this.deps.tts.synthesise({ text: agentText });
      this.send({ type: "agent-audio", chunk: encodeBase64(audioOut.audio) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "tts failed";
      this.send({ type: "error", message: `tts: ${msg}` });
      return;
    }

    const latency =
      this.turnStartedAt !== null ? this.nowFn() - this.turnStartedAt : 0;
    this.lastTurnLatencyMs = latency;
    this.turnsCompleted += 1;
    this.turnStartedAt = null;

    this.send({ type: "turn-complete", turnLatencyMs: latency });
  }
}
