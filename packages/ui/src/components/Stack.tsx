import { z } from "zod";
import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const StackPropsSchema = z.object({
  direction: z.enum(["horizontal", "vertical"]).default("vertical"),
  gap: z.enum(["none", "xs", "sm", "md", "lg", "xl"]).default("md"),
  align: z.enum(["start", "center", "end", "stretch", "baseline"]).default("stretch"),
  justify: z.enum(["start", "center", "end", "between", "around", "evenly"]).default("start"),
  wrap: z.boolean().default(false),
});

export type StackSchemaProps = z.input<typeof StackPropsSchema>;

export interface StackProps extends StackSchemaProps {
  children?: JSX.Element;
  class?: string;
  as?: "div" | "section" | "nav" | "article" | "main" | "aside";
}

const gapClasses: Record<NonNullable<StackSchemaProps["gap"]>, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

const alignClasses: Record<NonNullable<StackSchemaProps["align"]>, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyClasses: Record<NonNullable<StackSchemaProps["justify"]>, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

export function Stack(props: StackProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "direction", "gap", "align", "justify", "wrap", "children", "class", "as",
  ]);

  return (
    <Dynamic
      component={local.as ?? "div"}
      class={`flex ${(local.direction ?? "vertical") === "horizontal" ? "flex-row" : "flex-col"} ${gapClasses[local.gap ?? "md"]} ${alignClasses[local.align ?? "stretch"]} ${justifyClasses[local.justify ?? "start"]} ${local.wrap ? "flex-wrap" : ""} ${local.class ?? ""}`}
      {...rest}
    >
      {local.children}
    </Dynamic>
  );
}
