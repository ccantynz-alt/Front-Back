import { describe, test, expect } from "bun:test";
import {
  describeComponentCatalog,
  buildGenerativeUIPrompt,
  validateComponentTree,
  processGenerativeUIOutput,
} from "./renderer";

describe("Generative UI", () => {
  describe("describeComponentCatalog", () => {
    test("describes all components when no filter", () => {
      const desc = describeComponentCatalog();
      expect(desc).toContain("Button");
      expect(desc).toContain("Card");
      expect(desc).toContain("Modal");
      expect(desc).toContain("Separator");
    });

    test("filters to specified components", () => {
      const desc = describeComponentCatalog(["Button", "Text"]);
      expect(desc).toContain("Button");
      expect(desc).toContain("Text");
      expect(desc).not.toContain("Modal");
    });
  });

  describe("buildGenerativeUIPrompt", () => {
    test("builds prompt with description", () => {
      const prompt = buildGenerativeUIPrompt({
        description: "A login form with email and password",
      });
      expect(prompt).toContain("login form");
      expect(prompt).toContain("Available components");
    });

    test("includes context when provided", () => {
      const prompt = buildGenerativeUIPrompt({
        description: "A button",
        context: "This is for the dashboard header",
      });
      expect(prompt).toContain("dashboard header");
    });

    test("respects maxDepth", () => {
      const prompt = buildGenerativeUIPrompt({
        description: "A form",
        maxDepth: 2,
      });
      expect(prompt).toContain("Maximum nesting depth: 2");
    });
  });

  describe("validateComponentTree", () => {
    test("validates a valid tree", () => {
      const result = validateComponentTree([
        { component: "Button", props: { label: "Click" } },
        { component: "Text", props: { content: "Hello" } },
      ]);
      expect(result.success).toBe(true);
    });

    test("validates nested components", () => {
      const result = validateComponentTree([
        {
          component: "Card",
          props: { title: "My Card" },
          children: [
            { component: "Text", props: { content: "Body" } },
            { component: "Button", props: { label: "OK" } },
          ],
        },
      ]);
      expect(result.success).toBe(true);
    });

    test("rejects invalid components", () => {
      const result = validateComponentTree([
        { component: "FakeComponent", props: {} },
      ]);
      expect(result.success).toBe(false);
    });

    test("rejects invalid props", () => {
      const result = validateComponentTree([
        { component: "Button", props: {} }, // missing label
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("processGenerativeUIOutput", () => {
    test("processes valid JSON array", () => {
      const result = processGenerativeUIOutput(
        JSON.stringify([
          { component: "Text", props: { content: "Hello" } },
        ]),
      );
      expect(result.success).toBe(true);
      expect(result.tree).toHaveLength(1);
      expect(result.meta.componentCount).toBe(1);
      expect(result.meta.componentsUsed).toContain("Text");
    });

    test("wraps single object in array", () => {
      const result = processGenerativeUIOutput(
        JSON.stringify({ component: "Button", props: { label: "Go" } }),
      );
      expect(result.success).toBe(true);
      expect(result.tree).toHaveLength(1);
    });

    test("strips markdown code fences", () => {
      const result = processGenerativeUIOutput(
        '```json\n[{"component": "Text", "props": {"content": "Hi"}}]\n```',
      );
      expect(result.success).toBe(true);
    });

    test("handles invalid JSON", () => {
      const result = processGenerativeUIOutput("not json at all");
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("handles valid JSON but invalid components", () => {
      const result = processGenerativeUIOutput(
        JSON.stringify([{ component: "Fake", props: {} }]),
      );
      expect(result.success).toBe(false);
    });

    test("counts nested components", () => {
      const result = processGenerativeUIOutput(
        JSON.stringify([
          {
            component: "Card",
            props: {},
            children: [
              { component: "Text", props: { content: "A" } },
              { component: "Button", props: { label: "B" } },
            ],
          },
        ]),
      );
      expect(result.success).toBe(true);
      expect(result.meta.componentCount).toBe(3);
      expect(result.meta.componentsUsed).toContain("Card");
      expect(result.meta.componentsUsed).toContain("Text");
      expect(result.meta.componentsUsed).toContain("Button");
    });
  });
});
