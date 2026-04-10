import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface TextProps {
  content?: string;
  variant?: "h1" | "h2" | "h3" | "h4" | "body" | "caption" | "code";
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div" | "code" | "label" | "strong" | "em";
  weight?: "normal" | "medium" | "semibold" | "bold";
  align?: "left" | "center" | "right";
  size?: "xs" | "sm" | "md" | "lg";
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

const variantTagMap = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  caption: "span",
  code: "code",
} as const;

export function Text(props: TextProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "content",
    "variant",
    "as",
    "weight",
    "align",
    "size",
    "class",
    "style",
    "children",
  ]);

  const tag = (): string => local.as ?? variantTagMap[local.variant ?? "body"];
  const sizeClass = (): string => (local.size ? ` text-size-${local.size}` : "");

  return (
    <Dynamic
      component={tag()}
      class={`text-${local.variant ?? "body"} font-${local.weight ?? "normal"} text-${local.align ?? "left"}${sizeClass()} ${local.class ?? ""}`}
      style={local.style}
      {...rest}
    >
      {local.content ?? local.children}
    </Dynamic>
  );
}
