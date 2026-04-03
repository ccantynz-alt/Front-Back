import { describe, test, expect } from "bun:test";
import {
  ButtonSchema,
  ButtonVariant,
  ButtonSize,
  InputSchema,
  InputType,
  CardSchema,
  StackSchema,
  StackDirection,
  TextSchema,
  ModalSchema,
  ComponentSchema,
  ComponentCatalog,
} from "./components";

// ── ButtonSchema ─────────────────────────────────────────────────────

describe("ButtonSchema", () => {
  test("accepts valid button with all props", () => {
    const result = ButtonSchema.safeParse({
      component: "Button",
      props: {
        variant: "primary",
        size: "lg",
        disabled: true,
        loading: false,
        label: "Click me",
        onClick: "handleClick",
      },
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional props", () => {
    const result = ButtonSchema.safeParse({
      component: "Button",
      props: { label: "Click" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.props.variant).toBe("default");
      expect(result.data.props.size).toBe("md");
      expect(result.data.props.disabled).toBe(false);
      expect(result.data.props.loading).toBe(false);
    }
  });

  test("rejects missing label", () => {
    const result = ButtonSchema.safeParse({
      component: "Button",
      props: { variant: "primary" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects wrong component literal", () => {
    const result = ButtonSchema.safeParse({
      component: "Input",
      props: { label: "Click" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid variant", () => {
    const result = ButtonSchema.safeParse({
      component: "Button",
      props: { label: "Click", variant: "huge" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid size", () => {
    const result = ButtonSchema.safeParse({
      component: "Button",
      props: { label: "Click", size: "xxl" },
    });
    expect(result.success).toBe(false);
  });
});

describe("ButtonVariant", () => {
  test("accepts all valid variants", () => {
    const variants = [
      "default",
      "primary",
      "secondary",
      "destructive",
      "outline",
      "ghost",
      "link",
    ];
    for (const v of variants) {
      expect(ButtonVariant.safeParse(v).success).toBe(true);
    }
  });

  test("rejects invalid variant", () => {
    expect(ButtonVariant.safeParse("danger").success).toBe(false);
  });
});

describe("ButtonSize", () => {
  test("accepts all valid sizes", () => {
    for (const s of ["sm", "md", "lg", "icon"]) {
      expect(ButtonSize.safeParse(s).success).toBe(true);
    }
  });

  test("rejects invalid size", () => {
    expect(ButtonSize.safeParse("xl").success).toBe(false);
  });
});

// ── InputSchema ──────────────────────────────────────────────────────

describe("InputSchema", () => {
  test("accepts valid input with all props", () => {
    const result = InputSchema.safeParse({
      component: "Input",
      props: {
        type: "email",
        placeholder: "Enter email",
        label: "Email",
        required: true,
        disabled: false,
        error: "Invalid email",
        name: "email",
      },
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional props", () => {
    const result = InputSchema.safeParse({
      component: "Input",
      props: { name: "field" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.props.type).toBe("text");
      expect(result.data.props.required).toBe(false);
      expect(result.data.props.disabled).toBe(false);
    }
  });

  test("rejects missing name", () => {
    const result = InputSchema.safeParse({
      component: "Input",
      props: { type: "text" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid type", () => {
    const result = InputSchema.safeParse({
      component: "Input",
      props: { name: "field", type: "checkbox" },
    });
    expect(result.success).toBe(false);
  });
});

describe("InputType", () => {
  test("accepts all valid input types", () => {
    const types = ["text", "email", "password", "number", "search", "tel", "url"];
    for (const t of types) {
      expect(InputType.safeParse(t).success).toBe(true);
    }
  });
});

// ── CardSchema ───────────────────────────────────────────────────────

describe("CardSchema", () => {
  test("accepts valid card with no children", () => {
    const result = CardSchema.safeParse({
      component: "Card",
      props: { title: "My Card", description: "Description", padding: "lg" },
    });
    expect(result.success).toBe(true);
  });

  test("applies default padding", () => {
    const result = CardSchema.safeParse({
      component: "Card",
      props: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.props.padding).toBe("md");
    }
  });

  test("accepts card with children components", () => {
    const result = CardSchema.safeParse({
      component: "Card",
      props: { title: "Card" },
      children: [
        { component: "Button", props: { label: "OK" } },
        { component: "Text", props: { content: "Hello", variant: "body" } },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects card with invalid children", () => {
    const result = CardSchema.safeParse({
      component: "Card",
      props: {},
      children: [{ component: "Unknown", props: {} }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid padding value", () => {
    const result = CardSchema.safeParse({
      component: "Card",
      props: { padding: "huge" },
    });
    expect(result.success).toBe(false);
  });
});

// ── StackSchema ──────────────────────────────────────────────────────

describe("StackSchema", () => {
  test("accepts valid stack", () => {
    const result = StackSchema.safeParse({
      component: "Stack",
      props: { direction: "horizontal", gap: "lg", align: "center", justify: "between" },
    });
    expect(result.success).toBe(true);
  });

  test("applies all defaults", () => {
    const result = StackSchema.safeParse({
      component: "Stack",
      props: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.props.direction).toBe("vertical");
      expect(result.data.props.gap).toBe("md");
      expect(result.data.props.align).toBe("stretch");
      expect(result.data.props.justify).toBe("start");
    }
  });

  test("accepts stack with children", () => {
    const result = StackSchema.safeParse({
      component: "Stack",
      props: {},
      children: [
        { component: "Button", props: { label: "A" } },
        { component: "Button", props: { label: "B" } },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid direction", () => {
    const result = StackSchema.safeParse({
      component: "Stack",
      props: { direction: "diagonal" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid gap", () => {
    const result = StackSchema.safeParse({
      component: "Stack",
      props: { gap: "huge" },
    });
    expect(result.success).toBe(false);
  });
});

describe("StackDirection", () => {
  test("accepts horizontal and vertical", () => {
    expect(StackDirection.safeParse("horizontal").success).toBe(true);
    expect(StackDirection.safeParse("vertical").success).toBe(true);
  });

  test("rejects other values", () => {
    expect(StackDirection.safeParse("diagonal").success).toBe(false);
  });
});

// ── TextSchema ───────────────────────────────────────────────────────

describe("TextSchema", () => {
  test("accepts valid text", () => {
    const result = TextSchema.safeParse({
      component: "Text",
      props: { content: "Hello world", variant: "h1", weight: "bold", align: "center" },
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults", () => {
    const result = TextSchema.safeParse({
      component: "Text",
      props: { content: "Hello" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.props.variant).toBe("body");
      expect(result.data.props.weight).toBe("normal");
      expect(result.data.props.align).toBe("left");
    }
  });

  test("rejects missing content", () => {
    const result = TextSchema.safeParse({
      component: "Text",
      props: {},
    });
    expect(result.success).toBe(false);
  });

  test("accepts all valid variants", () => {
    for (const v of ["h1", "h2", "h3", "h4", "body", "caption", "code"]) {
      const result = TextSchema.safeParse({
        component: "Text",
        props: { content: "x", variant: v },
      });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid variant", () => {
    const result = TextSchema.safeParse({
      component: "Text",
      props: { content: "x", variant: "h5" },
    });
    expect(result.success).toBe(false);
  });
});

// ── ModalSchema ──────────────────────────────────────────────────────

describe("ModalSchema", () => {
  test("accepts valid modal", () => {
    const result = ModalSchema.safeParse({
      component: "Modal",
      props: { title: "Confirm", description: "Are you sure?", open: true, size: "lg" },
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults", () => {
    const result = ModalSchema.safeParse({
      component: "Modal",
      props: { title: "Dialog" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.props.open).toBe(false);
      expect(result.data.props.size).toBe("md");
    }
  });

  test("rejects missing title", () => {
    const result = ModalSchema.safeParse({
      component: "Modal",
      props: {},
    });
    expect(result.success).toBe(false);
  });

  test("accepts all valid sizes", () => {
    for (const s of ["sm", "md", "lg", "xl"]) {
      const result = ModalSchema.safeParse({
        component: "Modal",
        props: { title: "T", size: s },
      });
      expect(result.success).toBe(true);
    }
  });

  test("accepts modal with children", () => {
    const result = ModalSchema.safeParse({
      component: "Modal",
      props: { title: "Title" },
      children: [{ component: "Text", props: { content: "Body" } }],
    });
    expect(result.success).toBe(true);
  });
});

// ── ComponentSchema (discriminated union) ────────────────────────────

describe("ComponentSchema", () => {
  test("correctly discriminates Button", () => {
    const result = ComponentSchema.safeParse({
      component: "Button",
      props: { label: "Go" },
    });
    expect(result.success).toBe(true);
  });

  test("correctly discriminates Input", () => {
    const result = ComponentSchema.safeParse({
      component: "Input",
      props: { name: "email" },
    });
    expect(result.success).toBe(true);
  });

  test("correctly discriminates Text", () => {
    const result = ComponentSchema.safeParse({
      component: "Text",
      props: { content: "hi" },
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown component type", () => {
    const result = ComponentSchema.safeParse({
      component: "Dropdown",
      props: {},
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty object", () => {
    const result = ComponentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── ComponentCatalog ─────────────────────────────────────────────────

describe("ComponentCatalog", () => {
  test("contains all 15 components", () => {
    const names = Object.keys(ComponentCatalog);
    const expected = [
      "Button", "Input", "Card", "Stack", "Text", "Modal",
      "Badge", "Alert", "Avatar", "Tabs", "Select",
      "Textarea", "Spinner", "Tooltip", "Separator",
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
    expect(names.length).toBe(15);
  });

  test("each catalog entry is a Zod schema that parses correctly", () => {
    const samples: Record<string, unknown> = {
      Button: { component: "Button", props: { label: "x" } },
      Input: { component: "Input", props: { name: "x" } },
      Card: { component: "Card", props: {} },
      Stack: { component: "Stack", props: {} },
      Text: { component: "Text", props: { content: "x" } },
      Modal: { component: "Modal", props: { title: "x" } },
      Badge: { component: "Badge", props: { label: "x" } },
      Alert: { component: "Alert", props: {} },
      Avatar: { component: "Avatar", props: {} },
      Tabs: { component: "Tabs", props: { items: [{ id: "t1", label: "Tab" }] } },
      Select: { component: "Select", props: { options: [{ value: "a", label: "A" }] } },
      Textarea: { component: "Textarea", props: {} },
      Spinner: { component: "Spinner", props: {} },
      Tooltip: { component: "Tooltip", props: { content: "tip" } },
      Separator: { component: "Separator", props: {} },
    };
    for (const [name, schema] of Object.entries(ComponentCatalog)) {
      const result = schema.safeParse(samples[name]);
      expect(result.success).toBe(true);
    }
  });
});
