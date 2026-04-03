import { z } from "zod";

// ── Core UI Component Schemas (AI-Composable) ──────────────────────
// Every component in the system is defined by a Zod schema.
// AI agents use these schemas to discover, validate, and compose UI.

export const ButtonVariant = z.enum([
  "default",
  "primary",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
]);

export const ButtonSize = z.enum(["sm", "md", "lg", "icon"]);

export const ButtonSchema = z.object({
  component: z.literal("Button"),
  props: z.object({
    variant: ButtonVariant.default("default"),
    size: ButtonSize.default("md"),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
    label: z.string(),
    onClick: z.string().optional(),
  }),
});

export const InputType = z.enum([
  "text",
  "email",
  "password",
  "number",
  "search",
  "tel",
  "url",
]);

export const InputSchema = z.object({
  component: z.literal("Input"),
  props: z.object({
    type: InputType.default("text"),
    placeholder: z.string().optional(),
    label: z.string().optional(),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    error: z.string().optional(),
    name: z.string(),
  }),
});

export const CardSchema = z.object({
  component: z.literal("Card"),
  props: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    padding: z.enum(["none", "sm", "md", "lg"]).default("md"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const StackDirection = z.enum(["horizontal", "vertical"]);

export const StackSchema = z.object({
  component: z.literal("Stack"),
  props: z.object({
    direction: StackDirection.default("vertical"),
    gap: z.enum(["none", "xs", "sm", "md", "lg", "xl"]).default("md"),
    align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    justify: z
      .enum(["start", "center", "end", "between", "around"])
      .default("start"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const TextSchema = z.object({
  component: z.literal("Text"),
  props: z.object({
    content: z.string(),
    variant: z
      .enum(["h1", "h2", "h3", "h4", "body", "caption", "code"])
      .default("body"),
    weight: z.enum(["normal", "medium", "semibold", "bold"]).default("normal"),
    align: z.enum(["left", "center", "right"]).default("left"),
  }),
});

export const ModalSchema = z.object({
  component: z.literal("Modal"),
  props: z.object({
    title: z.string(),
    description: z.string().optional(),
    open: z.boolean().default(false),
    size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const BadgeVariant = z.enum([
  "default",
  "success",
  "warning",
  "error",
  "info",
]);

export const BadgeSchema = z.object({
  component: z.literal("Badge"),
  props: z.object({
    variant: BadgeVariant.default("default"),
    size: z.enum(["sm", "md"]).default("md"),
    label: z.string(),
  }),
});

export const AlertVariant = z.enum(["info", "success", "warning", "error"]);

export const AlertSchema = z.object({
  component: z.literal("Alert"),
  props: z.object({
    variant: AlertVariant.default("info"),
    title: z.string().optional(),
    description: z.string().optional(),
    dismissible: z.boolean().default(false),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const AvatarSchema = z.object({
  component: z.literal("Avatar"),
  props: z.object({
    src: z.string().optional(),
    alt: z.string().optional(),
    initials: z.string().optional(),
    size: z.enum(["sm", "md", "lg"]).default("md"),
  }),
});

export const TabItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  disabled: z.boolean().optional(),
});

export const TabsSchema = z.object({
  component: z.literal("Tabs"),
  props: z.object({
    items: z.array(TabItemSchema).min(1),
    defaultTab: z.string().optional(),
  }),
});

export const SelectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  disabled: z.boolean().optional(),
});

export const SelectSchema = z.object({
  component: z.literal("Select"),
  props: z.object({
    options: z.array(SelectOptionSchema).min(1),
    value: z.string().optional(),
    placeholder: z.string().optional(),
    label: z.string().optional(),
    error: z.string().optional(),
    disabled: z.boolean().default(false),
    name: z.string().optional(),
  }),
});

export const TextareaSchema = z.object({
  component: z.literal("Textarea"),
  props: z.object({
    label: z.string().optional(),
    error: z.string().optional(),
    placeholder: z.string().optional(),
    rows: z.number().int().positive().default(3),
    resize: z.enum(["none", "vertical", "horizontal", "both"]).default("vertical"),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    name: z.string().optional(),
  }),
});

export const SpinnerSchema = z.object({
  component: z.literal("Spinner"),
  props: z.object({
    size: z.enum(["sm", "md", "lg"]).default("md"),
  }),
});

export const TooltipSchema = z.object({
  component: z.literal("Tooltip"),
  props: z.object({
    content: z.string(),
    position: z.enum(["top", "bottom", "left", "right"]).default("top"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const SeparatorSchema = z.object({
  component: z.literal("Separator"),
  props: z.object({
    orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
  }),
});

export const ToggleSchema = z.object({
  component: z.literal("Toggle"),
  props: z.object({
    checked: z.boolean().default(false),
    disabled: z.boolean().default(false),
    label: z.string().optional(),
    description: z.string().optional(),
    size: z.enum(["sm", "md", "lg"]).default("md"),
    name: z.string().optional(),
  }),
});

// ── Component Registry (Union of all components) ───────────────────
// This is the master schema. AI agents use this to validate any component tree.

export const ComponentSchema: z.ZodType = z.discriminatedUnion("component", [
  ButtonSchema,
  InputSchema,
  CardSchema,
  StackSchema,
  TextSchema,
  ModalSchema,
  BadgeSchema,
  AlertSchema,
  AvatarSchema,
  TabsSchema,
  SelectSchema,
  TextareaSchema,
  SpinnerSchema,
  TooltipSchema,
  SeparatorSchema,
  ToggleSchema,
]);

export type Button = z.infer<typeof ButtonSchema>;
export type Input = z.infer<typeof InputSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Stack = z.infer<typeof StackSchema>;
export type Text = z.infer<typeof TextSchema>;
export type Modal = z.infer<typeof ModalSchema>;
export type Badge = z.infer<typeof BadgeSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type Avatar = z.infer<typeof AvatarSchema>;
export type Tabs = z.infer<typeof TabsSchema>;
export type Select = z.infer<typeof SelectSchema>;
export type Textarea = z.infer<typeof TextareaSchema>;
export type Spinner = z.infer<typeof SpinnerSchema>;
export type Tooltip = z.infer<typeof TooltipSchema>;
export type Separator = z.infer<typeof SeparatorSchema>;
export type Toggle = z.infer<typeof ToggleSchema>;
export type Component = z.infer<typeof ComponentSchema>;

// ── Component Catalog (for AI agent discovery) ─────────────────────

export const ComponentCatalog = {
  Button: ButtonSchema,
  Input: InputSchema,
  Card: CardSchema,
  Stack: StackSchema,
  Text: TextSchema,
  Modal: ModalSchema,
  Badge: BadgeSchema,
  Alert: AlertSchema,
  Avatar: AvatarSchema,
  Tabs: TabsSchema,
  Select: SelectSchema,
  Textarea: TextareaSchema,
  Spinner: SpinnerSchema,
  Tooltip: TooltipSchema,
  Separator: SeparatorSchema,
  Toggle: ToggleSchema,
} as const;

export type ComponentName = keyof typeof ComponentCatalog;
