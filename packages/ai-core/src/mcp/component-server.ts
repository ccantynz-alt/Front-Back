// ── MCP Server for Component Catalog ────────────────────────────────
// Exposes the component catalog via Model Context Protocol (MCP).
// AI agents discover components, their schemas, and compose UI through MCP.
// MCP is now the universal standard (97M+ monthly SDK downloads).

import { z } from "zod";
import {
  ComponentCatalog,
  ComponentSchema,
  type ComponentName,
} from "@back-to-the-future/schemas";

// ── MCP Tool Definitions ────────────────────────────────────────────
// These follow the MCP tool schema format for maximum compatibility.

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// ── Component Discovery Tools ───────────────────────────────────────

/**
 * List all available components in the catalog.
 */
export function listComponents(): {
  components: Array<{
    name: string;
    hasChildren: boolean;
    propCount: number;
    props: string[];
  }>;
} {
  const components = Object.entries(ComponentCatalog).map(([name, schema]) => {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const propsShape = (shape.props as z.ZodObject<z.ZodRawShape>)?.shape ?? {};
    const propNames = Object.keys(propsShape);
    const hasChildren = "children" in shape;

    return {
      name,
      hasChildren,
      propCount: propNames.length,
      props: propNames,
    };
  });

  return { components };
}

/**
 * Get detailed schema for a specific component.
 */
export function getComponentSchema(componentName: string): {
  name: string;
  schema: Record<string, unknown>;
  props: Record<string, { type: string; required: boolean; default?: unknown; description?: string }>;
  hasChildren: boolean;
  example: Record<string, unknown>;
} | null {
  const catalog = ComponentCatalog as Record<string, z.ZodType>;
  const schema = catalog[componentName];
  if (!schema) return null;

  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  const propsShape = (shape.props as z.ZodObject<z.ZodRawShape>)?.shape ?? {};
  const hasChildren = "children" in shape;

  // Extract prop details
  const props: Record<string, { type: string; required: boolean; default?: unknown; description?: string }> = {};
  for (const [propName, propSchema] of Object.entries(propsShape)) {
    const zodSchema = propSchema as z.ZodType;
    const description = zodSchema.description;
    const isOptional = zodSchema.isOptional?.() ?? false;
    let typeName = "unknown";
    let defaultValue: unknown;

    // Extract type info from Zod schema
    if (zodSchema instanceof z.ZodDefault) {
      defaultValue = zodSchema._def.defaultValue();
      typeName = getZodTypeName(zodSchema._def.innerType);
    } else if (zodSchema instanceof z.ZodOptional) {
      typeName = getZodTypeName(zodSchema._def.innerType);
    } else {
      typeName = getZodTypeName(zodSchema);
    }

    props[propName] = {
      type: typeName,
      required: !isOptional && defaultValue === undefined,
      ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      ...(description ? { description } : {}),
    };
  }

  // Generate example
  const example = generateExample(componentName as ComponentName);

  return {
    name: componentName,
    schema: { type: "object", properties: { component: componentName, props: Object.keys(propsShape) } },
    props,
    hasChildren,
    example,
  };
}

/**
 * Validate a component configuration against the schema.
 */
export function validateComponent(config: unknown): {
  valid: boolean;
  errors: string[];
  component?: z.infer<typeof ComponentSchema>;
} {
  const result = ComponentSchema.safeParse(config);
  if (result.success) {
    return { valid: true, errors: [], component: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

/**
 * Validate an array of components (a full UI tree).
 */
export function validateComponentTree(tree: unknown[]): {
  valid: boolean;
  errors: string[];
  components?: z.infer<typeof ComponentSchema>[];
} {
  const treeSchema = z.array(ComponentSchema);
  const result = treeSchema.safeParse(tree);
  if (result.success) {
    return { valid: true, errors: [], components: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

// ── MCP Server Definition ───────────────────────────────────────────

/**
 * Returns the MCP tool definitions for the component catalog.
 * These can be registered with any MCP-compatible server.
 */
export function getMCPTools(): MCPTool[] {
  return [
    {
      name: "btf_list_components",
      description:
        "List all available UI components in the Back to the Future component catalog. " +
        "Returns component names, prop counts, and whether they accept children.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "btf_get_component_schema",
      description:
        "Get the detailed schema for a specific UI component including all props, their types, defaults, and an example configuration.",
      inputSchema: {
        type: "object",
        properties: {
          componentName: {
            type: "string",
            description: "The component name to get the schema for",
            enum: Object.keys(ComponentCatalog),
          },
        },
        required: ["componentName"],
      },
    },
    {
      name: "btf_validate_component",
      description:
        "Validate a component configuration against the Zod schema. Returns whether the config is valid and any validation errors.",
      inputSchema: {
        type: "object",
        properties: {
          config: {
            type: "object",
            description: "The component configuration to validate (must have 'component' and 'props' fields)",
          },
        },
        required: ["config"],
      },
    },
    {
      name: "btf_validate_tree",
      description:
        "Validate a complete UI component tree (array of components). Checks that all components and their nested children are valid.",
      inputSchema: {
        type: "object",
        properties: {
          tree: {
            type: "array",
            description: "Array of component configurations to validate",
          },
        },
        required: ["tree"],
      },
    },
    {
      name: "btf_generate_example",
      description:
        "Generate an example configuration for a specific component with sensible defaults.",
      inputSchema: {
        type: "object",
        properties: {
          componentName: {
            type: "string",
            description: "The component to generate an example for",
            enum: Object.keys(ComponentCatalog),
          },
        },
        required: ["componentName"],
      },
    },
  ];
}

/**
 * Returns MCP resources exposing the component catalog as browsable data.
 */
export function getMCPResources(): MCPResource[] {
  return [
    {
      uri: "btf://components/catalog",
      name: "Component Catalog",
      description: "Complete component catalog with all available UI components",
      mimeType: "application/json",
    },
    ...Object.keys(ComponentCatalog).map((name) => ({
      uri: `btf://components/${name.toLowerCase()}`,
      name: `${name} Component`,
      description: `Schema and examples for the ${name} component`,
      mimeType: "application/json",
    })),
  ];
}

/**
 * Handle an MCP tool call. Routes to the appropriate handler.
 */
export function handleMCPToolCall(
  toolName: string,
  args: Record<string, unknown>,
): unknown {
  switch (toolName) {
    case "btf_list_components":
      return listComponents();
    case "btf_get_component_schema":
      return getComponentSchema(args.componentName as string);
    case "btf_validate_component":
      return validateComponent(args.config);
    case "btf_validate_tree":
      return validateComponentTree(args.tree as unknown[]);
    case "btf_generate_example":
      return generateExample(args.componentName as ComponentName);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Handle an MCP resource read. Returns the resource content.
 */
export function handleMCPResourceRead(uri: string): unknown {
  if (uri === "btf://components/catalog") {
    return listComponents();
  }

  const match = uri.match(/^btf:\/\/components\/(.+)$/);
  if (match) {
    const name = match[1];
    // Find component by lowercase name
    const componentName = Object.keys(ComponentCatalog).find(
      (k) => k.toLowerCase() === name,
    );
    if (componentName) {
      return getComponentSchema(componentName);
    }
  }

  return { error: `Resource not found: ${uri}` };
}

// ── Helpers ─────────────────────────────────────────────────────────

function getZodTypeName(schema: z.ZodType): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodEnum) return `enum(${(schema as z.ZodEnum<[string]>).options.join("|")})`;
  if (schema instanceof z.ZodArray) return "array";
  if (schema instanceof z.ZodObject) return "object";
  if (schema instanceof z.ZodLiteral) return `literal(${String(schema.value)})`;
  if (schema instanceof z.ZodOptional) return getZodTypeName(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return getZodTypeName(schema._def.innerType);
  return "unknown";
}

function generateExample(componentName: ComponentName): Record<string, unknown> {
  const defaults: Record<ComponentName, Record<string, unknown>> = {
    Button: { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Click me" } },
    Input: { component: "Input", props: { type: "text", placeholder: "Enter text...", name: "field", required: false, disabled: false } },
    Card: { component: "Card", props: { title: "Card Title", padding: "md" }, children: [{ component: "Text", props: { content: "Card content", variant: "body", weight: "normal", align: "left" } }] },
    Stack: { component: "Stack", props: { direction: "vertical", gap: "md", align: "stretch", justify: "start" }, children: [] },
    Text: { component: "Text", props: { content: "Hello World", variant: "body", weight: "normal", align: "left" } },
    Modal: { component: "Modal", props: { title: "Modal Title", size: "md", open: false } },
    Badge: { component: "Badge", props: { variant: "success", size: "md", label: "New" } },
    Alert: { component: "Alert", props: { variant: "info", title: "Information" } },
    Avatar: { component: "Avatar", props: { initials: "JD", size: "md" } },
    Tabs: { component: "Tabs", props: { items: [{ id: "tab-1", label: "Tab 1" }, { id: "tab-2", label: "Tab 2" }] } },
    Select: { component: "Select", props: { options: [{ value: "1", label: "Option 1" }, { value: "2", label: "Option 2" }], placeholder: "Choose..." } },
    Textarea: { component: "Textarea", props: { placeholder: "Write something...", rows: 3, resize: "vertical" } },
    Spinner: { component: "Spinner", props: { size: "md" } },
    Tooltip: { component: "Tooltip", props: { content: "Helpful tip", position: "top" } },
    Separator: { component: "Separator", props: { orientation: "horizontal" } },
  };

  return defaults[componentName] ?? { error: `Unknown component: ${componentName}` };
}
