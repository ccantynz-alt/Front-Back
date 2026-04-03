import { z } from "zod";
import { type JSX, splitProps } from "solid-js";

// ── Zod Schema (AI Composability) ─��───────────────���──────────────────
export const BadgePropsSchema = z.object({
  variant: z.enum(["default", "success", "warning", "error", "info"]).default("default"),
  size: z.enum(["sm", "md"]).default("md"),
  label: z.string().optional(),
});

export type BadgeSchemaProps = z.input<typeof BadgePropsSchema>;

export interface BadgeProps extends BadgeSchemaProps {
  children?: JSX.Element;
  class?: string;
}

const variantClasses: Record<NonNullable<BadgeSchemaProps["variant"]>, string> = {
  default: "bg-gray-100 text-gray-700 border-gray-200",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

const sizeClasses: Record<NonNullable<BadgeSchemaProps["size"]>, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-sm",
};

export function Badge(props: BadgeProps): JSX.Element {
  const [local, rest] = splitProps(props, ["variant", "size", "label", "children", "class"]);

  const variant = (): NonNullable<BadgeSchemaProps["variant"]> => local.variant ?? "default";
  const size = (): NonNullable<BadgeSchemaProps["size"]> => local.size ?? "md";

  return (
    <span
      class={`inline-flex items-center font-medium rounded-full border ${variantClasses[variant()]} ${sizeClasses[size()]} ${local.class ?? ""}`}
      role="status"
      {...rest}
    >
      {local.label ?? local.children}
    </span>
  );
}
