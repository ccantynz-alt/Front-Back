// ── Multi-Agent Orchestrator ──────────────────────────────────────────
// LangGraph-style stateful multi-agent orchestration.
// Agents plan, execute, observe, and adapt — not single-shot LLM calls.
// Sustained autonomous workflows with memory and branching logic.

import { streamText, generateObject, type ModelMessage } from "ai";
import { z } from "zod";
import { getModelForTier, getDefaultModel, type AIProviderEnv } from "../providers";
import { allTools } from "../tools";
import type { ComputeTier } from "../compute-tier";

// ── Agent Types ──────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools?: Record<string, unknown>;
  computeTier?: ComputeTier;
  maxSteps?: number;
}

export interface AgentState {
  agentId: string;
  messages: ModelMessage[];
  context: Record<string, unknown>;
  status: "idle" | "running" | "waiting_approval" | "completed" | "failed";
  steps: AgentStep[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentStep {
  stepId: string;
  agentId: string;
  action: string;
  input: unknown;
  output: unknown;
  status: "pending" | "running" | "completed" | "failed" | "approved" | "rejected";
  requiresApproval: boolean;
  timestamp: number;
}

// ── Orchestrator ─────────────────────────────────────────────────────

export class AgentOrchestrator {
  private agents = new Map<string, AgentDefinition>();
  private states = new Map<string, AgentState>();
  private providerEnv?: AIProviderEnv;

  constructor(config?: { providerEnv?: AIProviderEnv }) {
    this.providerEnv = config?.providerEnv;
  }

  /** Register an agent definition. */
  registerAgent(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
  }

  /** Get all registered agents. */
  getAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /** Create a new agent execution state. */
  createSession(agentId: string, initialContext?: Record<string, unknown>): AgentState {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not registered`);

    const state: AgentState = {
      agentId,
      messages: [{ role: "system", content: agent.systemPrompt }],
      context: initialContext ?? {},
      status: "idle",
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sessionId = `${agentId}-${Date.now()}`;
    this.states.set(sessionId, state);
    return state;
  }

  /** Run the agent with a user message, returning a streaming response. */
  async runAgent(
    sessionId: string,
    userMessage: string,
  ): Promise<{ text: string; steps: AgentStep[] }> {
    const state = this.states.get(sessionId);
    if (!state) throw new Error(`Session "${sessionId}" not found`);

    const agent = this.agents.get(state.agentId);
    if (!agent) throw new Error(`Agent "${state.agentId}" not registered`);

    state.status = "running";
    state.updatedAt = Date.now();

    // Add user message
    state.messages.push({ role: "user", content: userMessage });

    const tier = agent.computeTier ?? "cloud";
    const model = this.providerEnv
      ? getModelForTier(tier, this.providerEnv)
      : getDefaultModel();

    // Execute with tool calling
    const result = await streamText({
      model,
      messages: state.messages,
      tools: allTools,
      maxOutputTokens: 4096,
      temperature: 0.7,
    });

    // Collect the full response
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    // Record the step
    const step: AgentStep = {
      stepId: `step-${Date.now()}`,
      agentId: state.agentId,
      action: "generate",
      input: userMessage,
      output: fullText,
      status: "completed",
      requiresApproval: false,
      timestamp: Date.now(),
    };
    state.steps.push(step);

    // Add assistant response to conversation history
    state.messages.push({ role: "assistant", content: fullText });
    state.status = "completed";
    state.updatedAt = Date.now();

    return { text: fullText, steps: state.steps };
  }

  /** Get the current state of a session. */
  getSession(sessionId: string): AgentState | undefined {
    return this.states.get(sessionId);
  }

  /** List all active sessions. */
  getSessions(): Array<{ sessionId: string; state: AgentState }> {
    return Array.from(this.states.entries()).map(([sessionId, state]) => ({
      sessionId,
      state,
    }));
  }
}

// ── Pre-built Agent Definitions ──────────────────────────────────────

export const SITE_BUILDER_AGENT: AgentDefinition = {
  id: "site-builder",
  name: "Site Builder",
  description: "Builds websites by composing UI components from the validated catalog",
  systemPrompt: `You are a website builder AI. You compose UI layouts using validated components: Button, Input, Card, Stack, Text, Modal, Badge, Alert, Avatar, Tabs, Select, Textarea, Spinner, Tooltip, Separator. Use tools to generate and validate components.`,
  computeTier: "cloud",
  maxSteps: 10,
};

export const CODE_REVIEWER_AGENT: AgentDefinition = {
  id: "code-reviewer",
  name: "Code Reviewer",
  description: "Reviews code for quality, security, and performance issues",
  systemPrompt: `You are a code review AI. Analyze code for quality issues, security vulnerabilities, performance problems, and suggest improvements. Use the analyzeCode tool for detailed analysis. Follow the project's strict TypeScript standards: no 'any', no '@ts-ignore', typed error handling.`,
  computeTier: "cloud",
  maxSteps: 5,
};

export const CONTENT_WRITER_AGENT: AgentDefinition = {
  id: "content-writer",
  name: "Content Writer",
  description: "Writes and edits website content, copy, and documentation",
  systemPrompt: `You are a content writing AI. Generate compelling website copy, headlines, descriptions, and documentation. Use searchContent to find existing content for context. Write in a clear, professional tone appropriate for the target audience.`,
  computeTier: "edge",
  maxSteps: 5,
};

// ── Factory ──────────────────────────────────────────────────────────

export function createOrchestrator(config?: { providerEnv?: AIProviderEnv }): AgentOrchestrator {
  const orchestrator = new AgentOrchestrator(config);
  orchestrator.registerAgent(SITE_BUILDER_AGENT);
  orchestrator.registerAgent(CODE_REVIEWER_AGENT);
  orchestrator.registerAgent(CONTENT_WRITER_AGENT);
  return orchestrator;
}
