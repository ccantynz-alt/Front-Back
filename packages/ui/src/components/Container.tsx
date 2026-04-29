import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

/**
 * Container — centered, max-width-clamped, padded wrapper.
 *
 * Replaces the very common `<div class="mx-auto w-full max-w-[Npx] px-6 lg:px-8">`
 * pattern across landing routes. The width tokens map to the design
 * system's container scale; pick the smallest one that fits the content.
 *
 *   max-width   token     used for
 *   ──────────  ────────  ────────────────────────────────────
 *   640px       sm        narrow text columns
 *   768px       md        forms, modals
 *   960px       lg        most marketing sections
 *   1120px      xl        landing page hero / stats / pricing
 *   1280px      2xl       wide product galleries / dashboards
 *   none        full      no max-width clamp (full bleed)
 */
export interface ContainerProps {
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Override the rendered tag — defaults to `div`. */
  as?: "div" | "section" | "header" | "main" | "footer" | "article";
  /** Horizontal padding scale. `md` = px-6 lg:px-8 (the most common). */
  padding?: "none" | "sm" | "md" | "lg";
  class?: string;
  style?: JSX.CSSProperties | string;
  id?: string;
  children?: JSX.Element;
}

const sizeMaxWidth: Record<NonNullable<ContainerProps["size"]>, string> = {
  sm: "max-w-[640px]",
  md: "max-w-[768px]",
  lg: "max-w-[960px]",
  xl: "max-w-[1120px]",
  "2xl": "max-w-[1280px]",
  full: "",
};

const paddingClass: Record<NonNullable<ContainerProps["padding"]>, string> = {
  none: "",
  sm: "px-4",
  md: "px-6 lg:px-8",
  lg: "px-8 lg:px-12",
};

export function Container(props: ContainerProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "size",
    "as",
    "padding",
    "class",
    "style",
    "children",
  ]);
  const tag = (): NonNullable<ContainerProps["as"]> => local.as ?? "div";
  const cls = (): string => {
    const size = local.size ?? "xl";
    const pad = local.padding ?? "md";
    return [
      "mx-auto w-full",
      sizeMaxWidth[size],
      paddingClass[pad],
      local.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  };
  return (
    <Dynamic
      component={tag()}
      class={cls()}
      style={local.style as JSX.CSSProperties | undefined}
      {...rest}
    >
      {local.children}
    </Dynamic>
  );
}
