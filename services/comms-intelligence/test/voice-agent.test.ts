import { describe, expect, it } from "bun:test";
import { StubLlmClient } from "../src/llm-client";
import { ConversationMemory } from "../src/memory";
import {
  StubSttClient,
  StubTtsClient,
  type VoiceAgentOutbound,
  VoiceAgentSession,
} from "../src/voice-agent";

function b64(s: string): string {
  return btoa(s);
}

function makeSession(opts: {
  sttScript?: string[];
  llm?: StubLlmClient;
  now?: () => number;
} = {}) {
  const stt = new StubSttClient(opts.sttScript ?? ["hello world"]);
  const tts = new StubTtsClient();
  const llm =
    opts.llm ??
    new StubLlmClient({ responses: { "voice-agent-turn": "Hi there." } });
  const memory = new ConversationMemory();
  const out: VoiceAgentOutbound[] = [];
  const session = new VoiceAgentSession(
    {
      stt,
      tts,
      llm,
      memory,
      ...(opts.now !== undefined && { now: opts.now }),
    },
    (msg) => out.push(msg),
  );
  return { stt, tts, llm, memory, out, session };
}

describe("VoiceAgentSession - protocol", () => {
  it("emits ready on start", async () => {
    const { session, out } = makeSession();
    await session.handleInbound({ type: "start", conversationId: "c1" });
    expect(out[0]).toEqual({ type: "ready", conversationId: "c1" });
  });

  it("rejects audio before start", async () => {
    const { session, out } = makeSession();
    await session.handleInbound({ type: "audio", chunk: b64("\x00\x01") });
    expect(out[0]?.type).toBe("error");
  });

  it("completes a full turn: audio → end-of-turn → transcript → agent → audio", async () => {
    const { session, out, llm, tts } = makeSession({
      sttScript: ["what's the weather"],
      llm: new StubLlmClient({
        responses: { "voice-agent-turn": "It's sunny." },
      }),
    });
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "audio", chunk: b64("frame1") });
    await session.handleInbound({ type: "audio", chunk: b64("frame2") });
    await session.handleInbound({ type: "end-of-turn" });

    const types = out.map((m) => m.type);
    expect(types).toContain("ready");
    expect(types).toContain("transcript-final");
    expect(types).toContain("agent-thinking");
    expect(types).toContain("agent-text");
    expect(types).toContain("agent-audio");
    expect(types).toContain("turn-complete");

    const agentText = out.find((m) => m.type === "agent-text");
    expect(agentText && "text" in agentText && agentText.text).toBe("It's sunny.");
    expect(llm.callLog[0]?.purpose).toBe("voice-agent-turn");
    expect(tts.callLog[0]?.text).toBe("It's sunny.");
  });

  it("appends both user and assistant turns to memory", async () => {
    const { session, memory } = makeSession({
      sttScript: ["hi"],
      llm: new StubLlmClient({ responses: { "voice-agent-turn": "Hello." } }),
    });
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "audio", chunk: b64("a") });
    await session.handleInbound({ type: "end-of-turn" });
    const recent = memory.getRecentMessages("c1");
    expect(recent.length).toBe(2);
    expect(recent[0]?.role).toBe("user");
    expect(recent[0]?.content).toBe("hi");
    expect(recent[1]?.role).toBe("assistant");
    expect(recent[1]?.content).toBe("Hello.");
  });

  it("includes prior turns in the LLM prompt", async () => {
    const llm = new StubLlmClient({ responses: { "voice-agent-turn": "ok" } });
    const { session, memory } = makeSession({ sttScript: ["second"], llm });
    memory.appendMessage("c1", { role: "user", content: "first" });
    memory.appendMessage("c1", { role: "assistant", content: "yes" });
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "audio", chunk: b64("a") });
    await session.handleInbound({ type: "end-of-turn" });
    const prompt = llm.callLog[0]?.prompt ?? "";
    expect(prompt).toContain("first");
    expect(prompt).toContain("yes");
    expect(prompt).toContain("second");
  });

  it("ignores messages after stop", async () => {
    const { session, out } = makeSession();
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "stop" });
    const before = out.length;
    await session.handleInbound({ type: "audio", chunk: b64("a") });
    expect(out.length).toBe(before);
  });

  it("emits error for invalid base64 audio", async () => {
    const { session, out } = makeSession();
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "audio", chunk: "!!!not-base64!!!" });
    const err = out.find((m) => m.type === "error");
    expect(err).toBeDefined();
  });

  it("recovers gracefully when LLM fails", async () => {
    const failing = {
      complete: () => Promise.reject(new Error("upstream")),
    };
    const stt = new StubSttClient(["hi"]);
    const tts = new StubTtsClient();
    const memory = new ConversationMemory();
    const out: VoiceAgentOutbound[] = [];
    const session = new VoiceAgentSession(
      { stt, tts, llm: failing, memory },
      (m) => out.push(m),
    );
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "audio", chunk: b64("a") });
    await session.handleInbound({ type: "end-of-turn" });
    const err = out.find((m) => m.type === "error");
    expect(err).toBeDefined();
  });
});

describe("VoiceAgentSession - turn-taking timing harness", () => {
  it("reports a turn latency below the sub-300ms target with stubbed backends", async () => {
    let now = 1000;
    const { session, out } = makeSession({
      sttScript: ["hi"],
      now: () => now,
    });
    await session.handleInbound({ type: "start", conversationId: "c1" });
    now = 1010;
    await session.handleInbound({ type: "audio", chunk: b64("frame") });
    now = 1100;
    await session.handleInbound({ type: "end-of-turn" });
    const complete = out.find((m) => m.type === "turn-complete");
    expect(complete).toBeDefined();
    if (complete && complete.type === "turn-complete") {
      expect(complete.turnLatencyMs).toBeLessThan(300);
      expect(complete.turnLatencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("tracks turnsCompleted across multiple turns", async () => {
    const { session } = makeSession({
      sttScript: ["one", "two"],
      llm: new StubLlmClient({ responses: { "voice-agent-turn": "ok" } }),
    });
    await session.handleInbound({ type: "start", conversationId: "c1" });
    await session.handleInbound({ type: "audio", chunk: b64("a") });
    await session.handleInbound({ type: "end-of-turn" });
    await session.handleInbound({ type: "audio", chunk: b64("b") });
    await session.handleInbound({ type: "end-of-turn" });
    expect(session.stats().turnsCompleted).toBe(2);
  });
});
