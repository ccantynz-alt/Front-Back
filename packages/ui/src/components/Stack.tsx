import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface StackProps {
  direction?: "horizontal" | "vertical";
  gap?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

export function Stack(props: StackProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "direction",
    "gap",
    "align",
    "justify",
    "class",
    "style",
    "children",
  ]);

  const dir = (): string => local.direction ?? "vertical";
  const gapClass = (): string => `gap-${local.gap ?? "md"}`;
  const alignClass = (): string => `items-${local.align ?? "stretch"}`;
  const justifyClass = (): string => `justify-${local.justify ?? "start"}`;

  return (
    <div
      class={`flex ${dir() === "horizontal" ? "flex-row" : "flex-col"} ${gapClass()} ${alignClass()} ${justifyClass()} ${local.class ?? ""}`}
      style={local.style}
      {...rest}
    >
      {local.children}
    </div>
  );
}
