/**
 * @cronix/ui Schema Registry
 *
 * Central registry of all component Zod schemas for AI composability.
 * AI agents use this registry to discover, validate, and compose UI.
 */
import { z } from "zod";
import { ButtonPropsSchema } from "../components/Button";
import { InputPropsSchema } from "../components/Input";
import { TextareaPropsSchema } from "../components/Textarea";
import { CardPropsSchema } from "../components/Card";
import { ModalPropsSchema } from "../components/Modal";
import { StackPropsSchema } from "../components/Stack";
import { TextPropsSchema } from "../components/Text";
import { BadgePropsSchema } from "../components/Badge";
import { AvatarPropsSchema } from "../components/Avatar";
import { SpinnerPropsSchema } from "../components/Spinner";
import { AlertPropsSchema } from "../components/Alert";
import { TabsPropsSchema } from "../components/Tabs";
import { SelectPropsSchema } from "../components/Select";
import { TogglePropsSchema } from "../components/Toggle";
import { TooltipPropsSchema } from "../components/Tooltip";
import { SeparatorPropsSchema } from "../components/Separator";

// ── Re-exports ───────────────────────────────────────────────────────
export {
  ButtonPropsSchema,
  InputPropsSchema,
  TextareaPropsSchema,
  CardPropsSchema,
  ModalPropsSchema,
  StackPropsSchema,
  TextPropsSchema,
  BadgePropsSchema,
  AvatarPropsSchema,
  SpinnerPropsSchema,
  AlertPropsSchema,
  TabsPropsSchema,
  SelectPropsSchema,
  TogglePropsSchema,
  TooltipPropsSchema,
  SeparatorPropsSchema,
};

// ── Component Registry ───────────────────────────────────────────────
// Maps component names to their Zod prop schemas.
// AI agents use this to discover what components exist and what props they accept.

export const ComponentRegistry = {
  Button: ButtonPropsSchema,
  Input: InputPropsSchema,
  Textarea: TextareaPropsSchema,
  Card: CardPropsSchema,
  Modal: ModalPropsSchema,
  Stack: StackPropsSchema,
  Text: TextPropsSchema,
  Badge: BadgePropsSchema,
  Avatar: AvatarPropsSchema,
  Spinner: SpinnerPropsSchema,
  Alert: AlertPropsSchema,
  Tabs: TabsPropsSchema,
  Select: SelectPropsSchema,
  Toggle: TogglePropsSchema,
  Tooltip: TooltipPropsSchema,
  Separator: SeparatorPropsSchema,
} as const;

export type ComponentName = keyof typeof ComponentRegistry;

export const ComponentNameSchema = z.enum(
  Object.keys(ComponentRegistry) as [ComponentName, ...ComponentName[]],
);

// ── Utility: Get schema by component name ────────────────────────────
export function getComponentSchema(name: ComponentName): z.ZodType {
  return ComponentRegistry[name];
}

// ── Utility: Validate props for a given component ────────────────────
export function validateComponentProps(
  name: ComponentName,
  props: unknown,
): z.SafeParseReturnType<unknown, unknown> {
  const schema = ComponentRegistry[name];
  return schema.safeParse(props);
}
