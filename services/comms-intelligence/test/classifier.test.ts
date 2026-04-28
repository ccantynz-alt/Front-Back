import { describe, expect, it } from "bun:test";
import { classify, heuristicClassify } from "../src/classifier";
import { StubLlmClient } from "../src/llm-client";

describe("heuristicClassify - sentiment", () => {
  it("detects positive sentiment with praise words", () => {
    const out = heuristicClassify("I love this, thanks so much, amazing service");
    expect(out.sentiment).toBe("positive");
  });

  it("detects negative sentiment with complaint words", () => {
    const out = heuristicClassify("This is terrible, worst experience, hate it");
    expect(out.sentiment).toBe("negative");
  });

  it("detects neutral for mundane statements", () => {
    const out = heuristicClassify("Let me know the order number");
    expect(out.sentiment).toBe("neutral");
  });
});

describe("heuristicClassify - intent", () => {
  it("classifies questions ending in ?", () => {
    const out = heuristicClassify("Where is my order?");
    expect(out.intent).toBe("question");
  });

  it("classifies abuse with profanity patterns", () => {
    const out = heuristicClassify("you are a fucking scammer");
    expect(out.intent).toBe("abuse");
  });

  it("classifies cancel intent", () => {
    const out = heuristicClassify("I want to cancel my subscription");
    expect(out.intent).toBe("cancel");
  });

  it("classifies purchase intent", () => {
    const out = heuristicClassify("I want to buy the premium plan");
    expect(out.intent).toBe("purchase");
  });

  it("classifies support intent for issues", () => {
    const out = heuristicClassify("My app is broken and not working");
    expect(out.intent).toBe("support");
  });

  it("classifies praise intent", () => {
    const out = heuristicClassify("Thank you so much, I appreciate it");
    expect(out.intent).toBe("praise");
  });

  it("classifies smalltalk for greetings", () => {
    const out = heuristicClassify("Hello there, good morning");
    expect(out.intent).toBe("smalltalk");
  });

  it("classifies request for polite asks", () => {
    const out = heuristicClassify("Could you please send the invoice");
    expect(out.intent).toBe("request");
  });

  it("falls back to other for ambiguous text", () => {
    const out = heuristicClassify("xyz");
    expect(out.intent).toBe("other");
  });

  it("includes a confidence score in [0, 1]", () => {
    const out = heuristicClassify("hello");
    expect(out.confidence).toBeGreaterThanOrEqual(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
  });

  it("marks source heuristic", () => {
    const out = heuristicClassify("hi");
    expect(out.source).toBe("heuristic");
  });
});

describe("classify (with LLM)", () => {
  it("uses heuristic when confidence is high", async () => {
    const llm = new StubLlmClient({ defaultText: "SENTIMENT: negative\nINTENT: abuse" });
    const out = await classify(
      { text: "I love this, thanks so much, amazing perfect" },
      { llm },
    );
    expect(out.source).toBe("heuristic");
    expect(out.sentiment).toBe("positive");
    expect(llm.callLog.length).toBe(0);
  });

  it("consults LLM when heuristic confidence is low", async () => {
    const llm = new StubLlmClient({
      responses: { classify: "SENTIMENT: negative\nINTENT: complaint" },
    });
    const out = await classify({ text: "xyz" }, { llm, llmThreshold: 0.99 });
    expect(out.source).toBe("hybrid");
    expect(out.sentiment).toBe("negative");
    expect(out.intent).toBe("complaint");
    expect(llm.callLog.length).toBe(1);
  });

  it("falls back to heuristic on LLM failure", async () => {
    const failing = {
      complete: () => Promise.reject(new Error("network")),
    };
    const out = await classify({ text: "xyz" }, { llm: failing, llmThreshold: 0.99 });
    expect(out.source).toBe("heuristic");
  });

  it("ignores invalid sentiment/intent in LLM response", async () => {
    const llm = new StubLlmClient({
      responses: { classify: "SENTIMENT: confused\nINTENT: nope" },
    });
    const out = await classify({ text: "xyz" }, { llm, llmThreshold: 0.99 });
    // invalid → fall back to heuristic values
    expect(out.sentiment).toBe("neutral");
    expect(out.intent).toBe("other");
  });
});
