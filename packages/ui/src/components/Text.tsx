import { z } from "zod";
import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const TextPropsSchema = z.object({
  content: z.string().optional(),
  variant: z.enum(["h1", "h2", "h3", "h4", "h5", "h6", "body", "caption", "label", "code"]).default("body"),
  weight: z.enum(["normal", "medium", "semibold", "bold"]).default("normal"),
  size: z.enum(["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]).optional(),
  align: z.enum(["left", "center", "right"]).default("left"),
  color: z.enum(["default", "muted", "primary", "success", "warning", "error"]).default("default"),
  truncate: z.boolean().default(false),
});

export type TextSchemaProps = z.input<typeof TextPropsSchema>;

export interface TextProps extends TextSchemaProps {
  children?: JSX.Element;
  class?: string;
}

const variantTagMap: Record<NonNullable<TextSchemaProps["variant"]>, string> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  body: "p",
  caption: "span",
  label: "label",
  code: "code",
};

const variantClasses: Record<NonNullable<TextSchemaProps["variant"]>, string> = {
  h1: "text-4xl font-bold tracking-tight",
  h2: "text-3xl font-semibold tracking-tight",
  h3: "text-2xl font-semibold",
  h4: "text-xl font-semibold",
  h5: "text-lg font-medium",
  h6: "text-base font-medium",
  body: "text-base",
  caption: "text-sm",
  label: "text-sm font-medium",
  code: "font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded",
};

const weightClasses: Record<NonNullable<TextSchemaProps["weight"]>, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const alignClasses: Record<NonNullable<TextSchemaProps["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const colorClasses: Record<NonNullable<TextSchemaProps["color"]>, string> = {
  default: "text-gray-900",
  muted: "text-gray-500",
  primary: "text-blue-600",
  success: "text-green-600",
  warning: "text-amber-600",
  error: "text-red-600",
};

const sizeClasses: Record<NonNullable<TextSchemaProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

export function Text(props: TextProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "content", "variant", "weight", "size", "align", "color", "truncate", "children", "class",
  ]);

  const v = (): NonNullable<TextSchemaProps["variant"]> => local.variant ?? "body";

  return (
    <Dynamic
      component={variantTagMap[v()]}
      class={`${variantClasses[v()]} ${local.weight && local.weight !== "normal" ? weightClasses[local.weight] : ""} ${alignClasses[local.align ?? "left"]} ${colorClasses[local.color ?? "default"]} ${local.size ? sizeClasses[local.size] : ""} ${local.truncate ? "truncate" : ""} ${local.class ?? ""}`}
      {...rest}
    >
      {local.content ?? local.children}
    </Dynamic>
  );
}
