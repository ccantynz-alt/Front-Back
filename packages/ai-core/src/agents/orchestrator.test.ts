import { describe, test, expect } from "bun:test";
import {
  AgentOrchestrator,
  createOrchestrator,
  SITE_BUILDER_AGENT,
  CODE_REVIEWER_AGENT,
  CONTENT_WRITER_AGENT,
} from "./orchestrator";

describe("AgentOrchestrator", () => {
  test("creates orchestrator with pre-built agents", () => {
    const orchestrator = createOrchestrator();
    const agents = orchestrator.getAgents();
    expect(agents.length).toBe(3);
    const ids = agents.map((a) => a.id);
    expect(ids).toContain("site-builder");
    expect(ids).toContain("code-reviewer");
    expect(ids).toContain("content-writer");
  });

  test("registers a custom agent", () => {
    const orchestrator = new AgentOrchestrator();
    orchestrator.registerAgent({
      id: "custom-agent",
      name: "Custom",
      description: "A custom agent",
      systemPrompt: "You are a custom agent.",
    });
    expect(orchestrator.getAgents().length).toBe(1);
  });

  test("creates a session for a registered agent", () => {
    const orchestrator = createOrchestrator();
    const state = orchestrator.createSession("site-builder", { project: "test" });
    expect(state.agentId).toBe("site-builder");
    expect(state.status).toBe("idle");
    expect(state.context.project).toBe("test");
    expect(state.messages.length).toBe(1); // system prompt
  });

  test("throws when creating session for unregistered agent", () => {
    const orchestrator = new AgentOrchestrator();
    expect(() => orchestrator.createSession("nonexistent")).toThrow(
      'Agent "nonexistent" not registered',
    );
  });

  test("pre-built agents have correct properties", () => {
    expect(SITE_BUILDER_AGENT.id).toBe("site-builder");
    expect(SITE_BUILDER_AGENT.computeTier).toBe("cloud");
    expect(SITE_BUILDER_AGENT.maxSteps).toBe(10);

    expect(CODE_REVIEWER_AGENT.id).toBe("code-reviewer");
    expect(CONTENT_WRITER_AGENT.id).toBe("content-writer");
    expect(CONTENT_WRITER_AGENT.computeTier).toBe("edge");
  });
});
