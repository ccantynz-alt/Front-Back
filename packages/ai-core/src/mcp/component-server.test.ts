import { describe, test, expect } from "bun:test";
import {
  listComponents,
  getComponentSchema,
  validateComponent,
  validateComponentTree,
  getMCPTools,
  getMCPResources,
  handleMCPToolCall,
  handleMCPResourceRead,
} from "./component-server";

describe("MCP Component Server", () => {
  describe("listComponents", () => {
    test("returns all 15 components", () => {
      const result = listComponents();
      expect(result.components).toHaveLength(15);
    });

    test("each component has name, hasChildren, propCount, props", () => {
      const result = listComponents();
      for (const comp of result.components) {
        expect(comp.name).toBeDefined();
        expect(typeof comp.hasChildren).toBe("boolean");
        expect(typeof comp.propCount).toBe("number");
        expect(Array.isArray(comp.props)).toBe(true);
      }
    });

    test("Button has expected props", () => {
      const result = listComponents();
      const button = result.components.find((c) => c.name === "Button");
      expect(button).toBeDefined();
      expect(button!.props).toContain("variant");
      expect(button!.props).toContain("label");
      expect(button!.hasChildren).toBe(false);
    });

    test("Card accepts children", () => {
      const result = listComponents();
      const card = result.components.find((c) => c.name === "Card");
      expect(card).toBeDefined();
      expect(card!.hasChildren).toBe(true);
    });
  });

  describe("getComponentSchema", () => {
    test("returns null for unknown component", () => {
      expect(getComponentSchema("FakeComponent")).toBeNull();
    });

    test("returns schema for Button", () => {
      const result = getComponentSchema("Button");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Button");
      expect(result!.props.variant).toBeDefined();
      expect(result!.props.label).toBeDefined();
      expect(result!.example.component).toBe("Button");
    });

    test("returns schema for Stack with children", () => {
      const result = getComponentSchema("Stack");
      expect(result).toBeDefined();
      expect(result!.hasChildren).toBe(true);
      expect(result!.props.direction).toBeDefined();
      expect(result!.props.gap).toBeDefined();
    });
  });

  describe("validateComponent", () => {
    test("valid Button passes validation", () => {
      const result = validateComponent({
        component: "Button",
        props: { variant: "primary", size: "md", label: "Test" },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("invalid component fails validation", () => {
      const result = validateComponent({
        component: "FakeComponent",
        props: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("missing required prop fails", () => {
      const result = validateComponent({
        component: "Button",
        props: { variant: "primary" },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateComponentTree", () => {
    test("valid tree passes", () => {
      const tree = [
        { component: "Text", props: { content: "Hello", variant: "h1", weight: "bold", align: "left" } },
        { component: "Button", props: { label: "Click", variant: "primary" } },
      ];
      const result = validateComponentTree(tree);
      expect(result.valid).toBe(true);
      expect(result.components).toHaveLength(2);
    });

    test("tree with invalid component fails", () => {
      const tree = [
        { component: "Text", props: { content: "Hello" } },
        { component: "Bad", props: {} },
      ];
      const result = validateComponentTree(tree);
      expect(result.valid).toBe(false);
    });
  });

  describe("getMCPTools", () => {
    test("returns 5 MCP tools", () => {
      const tools = getMCPTools();
      expect(tools).toHaveLength(5);
      const names = tools.map((t) => t.name);
      expect(names).toContain("btf_list_components");
      expect(names).toContain("btf_get_component_schema");
      expect(names).toContain("btf_validate_component");
      expect(names).toContain("btf_validate_tree");
      expect(names).toContain("btf_generate_example");
    });
  });

  describe("getMCPResources", () => {
    test("returns catalog + individual component resources", () => {
      const resources = getMCPResources();
      // 1 catalog + 15 components
      expect(resources).toHaveLength(16);
      expect(resources[0].uri).toBe("btf://components/catalog");
    });
  });

  describe("handleMCPToolCall", () => {
    test("btf_list_components returns components", () => {
      const result = handleMCPToolCall("btf_list_components", {}) as { components: unknown[] };
      expect(result.components).toBeDefined();
      expect(result.components.length).toBe(15);
    });

    test("btf_get_component_schema returns schema", () => {
      const result = handleMCPToolCall("btf_get_component_schema", { componentName: "Input" }) as { name: string };
      expect(result.name).toBe("Input");
    });

    test("btf_validate_component validates", () => {
      const result = handleMCPToolCall("btf_validate_component", {
        config: { component: "Badge", props: { label: "Test" } },
      }) as { valid: boolean };
      expect(result.valid).toBe(true);
    });

    test("unknown tool returns error", () => {
      const result = handleMCPToolCall("unknown", {}) as { error: string };
      expect(result.error).toContain("Unknown tool");
    });
  });

  describe("handleMCPResourceRead", () => {
    test("catalog resource returns components", () => {
      const result = handleMCPResourceRead("btf://components/catalog") as { components: unknown[] };
      expect(result.components).toBeDefined();
    });

    test("component resource returns schema", () => {
      const result = handleMCPResourceRead("btf://components/button") as { name: string };
      expect(result.name).toBe("Button");
    });

    test("unknown resource returns error", () => {
      const result = handleMCPResourceRead("btf://unknown") as { error: string };
      expect(result.error).toBeDefined();
    });
  });
});
