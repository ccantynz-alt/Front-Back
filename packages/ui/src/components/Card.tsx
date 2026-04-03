import { z } from "zod";
import { type JSX, splitProps, Show } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const CardPropsSchema = z.object({
  variant: z.enum(["default", "bordered", "elevated"]).default("default"),
  padding: z.enum(["none", "sm", "md", "lg"]).default("md"),
  title: z.string().optional(),
  description: z.string().optional(),
});

export type CardSchemaProps = z.input<typeof CardPropsSchema>;

export interface CardProps extends CardSchemaProps {
  header?: JSX.Element;
  footer?: JSX.Element;
  children?: JSX.Element;
  class?: string;
}

const variantClasses: Record<NonNullable<CardSchemaProps["variant"]>, string> = {
  default: "bg-white border border-gray-200 rounded-xl",
  bordered: "bg-white border-2 border-gray-300 rounded-xl",
  elevated: "bg-white rounded-xl shadow-lg shadow-gray-200/60",
};

const paddingClasses: Record<NonNullable<CardSchemaProps["padding"]>, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-8",
};

export function Card(props: CardProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant", "padding", "title", "description", "header", "footer", "children", "class",
  ]);

  const variant = (): NonNullable<CardSchemaProps["variant"]> => local.variant ?? "default";
  const padding = (): NonNullable<CardSchemaProps["padding"]> => local.padding ?? "md";

  return (
    <div class={`${variantClasses[variant()]} ${local.class ?? ""}`} {...rest}>
      <Show when={local.header}>
        <div class={`border-b border-gray-200 ${paddingClasses[padding()]}`}>{local.header}</div>
      </Show>
      <div class={paddingClasses[padding()]}>
        <Show when={local.title}>
          <h3 class="text-lg font-semibold text-gray-900">{local.title}</h3>
        </Show>
        <Show when={local.description}>
          <p class={`text-sm text-gray-500 ${local.title ? "mt-1" : ""}`}>{local.description}</p>
        </Show>
        <Show when={local.title || local.description}>
          <Show when={local.children}><div class="mt-4">{local.children}</div></Show>
        </Show>
        <Show when={!local.title && !local.description}>{local.children}</Show>
      </div>
      <Show when={local.footer}>
        <div class={`border-t border-gray-200 ${paddingClasses[padding()]}`}>{local.footer}</div>
      </Show>
    </div>
  );
}
