import { describe, expect, it } from "bun:test";
import { ConversationMemory, StubVectorSearch } from "../src/memory";

describe("ConversationMemory", () => {
  it("appends and retrieves messages in order", () => {
    const mem = new ConversationMemory();
    mem.appendMessage("c1", { role: "user", content: "hello" });
    mem.appendMessage("c1", { role: "assistant", content: "hi there" });
    const recent = mem.getRecentMessages("c1");
    expect(recent.length).toBe(2);
    expect(recent[0]?.content).toBe("hello");
    expect(recent[1]?.content).toBe("hi there");
    expect(recent[0]?.seq).toBe(1);
    expect(recent[1]?.seq).toBe(2);
  });

  it("respects per-conversation isolation", () => {
    const mem = new ConversationMemory();
    mem.appendMessage("a", { role: "user", content: "alpha" });
    mem.appendMessage("b", { role: "user", content: "bravo" });
    expect(mem.getRecentMessages("a")).toHaveLength(1);
    expect(mem.getRecentMessages("b")).toHaveLength(1);
    expect(mem.getRecentMessages("a")[0]?.content).toBe("alpha");
  });

  it("enforces rolling window at maxWindow", () => {
    const mem = new ConversationMemory({ maxWindow: 3 });
    mem.appendMessage("c", { role: "user", content: "1" });
    mem.appendMessage("c", { role: "user", content: "2" });
    mem.appendMessage("c", { role: "user", content: "3" });
    mem.appendMessage("c", { role: "user", content: "4" });
    const recent = mem.getRecentMessages("c");
    expect(recent.length).toBe(3);
    expect(recent[0]?.content).toBe("2");
    expect(recent[2]?.content).toBe("4");
  });

  it("getRecentMessages applies limit", () => {
    const mem = new ConversationMemory();
    for (let i = 0; i < 10; i += 1) {
      mem.appendMessage("c", { role: "user", content: `msg-${i}` });
    }
    const recent = mem.getRecentMessages("c", 3);
    expect(recent.length).toBe(3);
    expect(recent[0]?.content).toBe("msg-7");
    expect(recent[2]?.content).toBe("msg-9");
  });

  it("preserves metadata when appending", () => {
    const mem = new ConversationMemory();
    mem.appendMessage("c", {
      role: "user",
      content: "x",
      metadata: { phone: "+12025550100", country: "US" },
    });
    const recent = mem.getRecentMessages("c");
    expect(recent[0]?.metadata).toEqual({ phone: "+12025550100", country: "US" });
  });

  it("forget wipes a single conversation", () => {
    const mem = new ConversationMemory();
    mem.appendMessage("a", { role: "user", content: "a" });
    mem.appendMessage("b", { role: "user", content: "b" });
    mem.forget("a");
    expect(mem.getRecentMessages("a")).toEqual([]);
    expect(mem.getRecentMessages("b")).toHaveLength(1);
  });

  it("throws when conversationId is empty", () => {
    const mem = new ConversationMemory();
    expect(() => mem.appendMessage("", { role: "user", content: "x" })).toThrow();
  });
});

describe("ConversationMemory.getRagContext", () => {
  it("returns empty matches when no vector backend is configured", async () => {
    const mem = new ConversationMemory();
    const out = await mem.getRagContext("c", { query: "anything" });
    expect(out.matches).toEqual([]);
    expect(out.query).toBe("anything");
  });

  it("delegates to the vector backend with the topK", async () => {
    const vector = new StubVectorSearch({
      "billing question": [
        { id: "doc-1", text: "Plans cost X", score: 0.9 },
        { id: "doc-2", text: "Refund policy is Y", score: 0.8 },
      ],
    });
    const mem = new ConversationMemory({ vector, defaultTenantId: "tenant-42" });
    const out = await mem.getRagContext("c", { query: "billing question", topK: 2 });
    expect(out.matches.length).toBe(2);
    expect(out.matches[0]?.id).toBe("doc-1");
    expect(vector.callLog[0]?.tenantId).toBe("tenant-42");
    expect(vector.callLog[0]?.topK).toBe(2);
  });

  it("respects override tenantId", async () => {
    const vector = new StubVectorSearch();
    const mem = new ConversationMemory({ vector });
    await mem.getRagContext("c", { query: "q" }, "explicit-tenant");
    expect(vector.callLog[0]?.tenantId).toBe("explicit-tenant");
  });

  it("uses default topK of 5", async () => {
    const vector = new StubVectorSearch();
    const mem = new ConversationMemory({ vector });
    await mem.getRagContext("c", { query: "q" });
    expect(vector.callLog[0]?.topK).toBe(5);
  });
});
