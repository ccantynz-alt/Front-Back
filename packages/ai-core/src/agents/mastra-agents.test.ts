import { describe, test, expect } from "bun:test";
import {
  siteBuilderAgent,
  codeReviewerAgent,
  contentWriterAgent,
  mastraAgents,
  searchContentTool,
  generateComponentTool,
  analyzeCodeTool,
} from "./mastra-agents";

describe("Mastra Agent Definitions", () => {
  test("all agents are defined", () => {
    expect(Object.keys(mastraAgents)).toHaveLength(3);
    expect(mastraAgents["site-builder"]).toBeDefined();
    expect(mastraAgents["code-reviewer"]).toBeDefined();
    expect(mastraAgents["content-writer"]).toBeDefined();
  });

  test("site builder agent has correct id", () => {
    expect(siteBuilderAgent.id).toBe("site-builder");
    expect(siteBuilderAgent.name).toBe("Site Builder");
  });

  test("code reviewer agent has correct id", () => {
    expect(codeReviewerAgent.id).toBe("code-reviewer");
    expect(codeReviewerAgent.name).toBe("Code Reviewer");
  });

  test("content writer agent has correct id", () => {
    expect(contentWriterAgent.id).toBe("content-writer");
    expect(contentWriterAgent.name).toBe("Content Writer");
  });
});

describe("Mastra Tools", () => {
  test("searchContentTool has correct id", () => {
    expect(searchContentTool.id).toBe("search-content");
    expect(searchContentTool.description).toContain("Search");
  });

  test("generateComponentTool has correct id", () => {
    expect(generateComponentTool.id).toBe("generate-component");
    expect(generateComponentTool.description).toContain("component");
  });

  test("analyzeCodeTool has correct id", () => {
    expect(analyzeCodeTool.id).toBe("analyze-code");
    expect(analyzeCodeTool.description).toContain("Analyze");
  });

  test("generateComponentTool execute returns valid result", async () => {
    const executeFn = generateComponentTool.execute as (input: { componentName: string; description: string }) => Promise<{ success: boolean; component: { component: string } | null }>;
    const result = await executeFn({
      componentName: "Button",
      description: "Submit form",
    });
    expect(result.success).toBe(true);
    expect(result.component).toBeDefined();
    expect(result.component!.component).toBe("Button");
  });

  test("analyzeCodeTool detects any type", async () => {
    const executeFn = analyzeCodeTool.execute as (input: { code: string; language: string; focus: string }) => Promise<{ issues: Array<{ message: string }> }>;
    const result = await executeFn({
      code: "const x: any = 'hello';",
      language: "typescript",
      focus: "all",
    });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].message).toContain("any");
  });
});
