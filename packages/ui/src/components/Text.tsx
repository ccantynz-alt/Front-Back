import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

export interface TextProps {
  content?: string;
  variant?: "h1" | "h2" | "h3" | "h4" | "body" | "caption" | "code";
  /**
   * Override the rendered HTML tag. Defaults are driven by `variant`
   * (body → p, caption → span, etc.) but you often want e.g. a
   * semibold `<span>` inside a `<p>` — pass `as="span"` for that.
   */
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div" | "code" | "label" | "strong" | "em";
  weight?: "normal" | "medium" | "semibold" | "bold";
  align?: "left" | "center" | "right";
  size?: "xs" | "sm" | "md" | "lg";
  class?: string;
  /**
   * Inline CSS for one-off overrides. Accepts a style object (preferred)
   * or a raw CSS string. Signed off at the component boundary so
   * call-sites don't have to reach for `as any`.
   */
  style?: JSX.CSSProperties | string;
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

  return (
    <Dynamic
      component={tag()}
      class={`text-${local.variant ?? "body"} font-${local.weight ?? "normal"} text-${local.align ?? "left"} ${local.class ?? ""}`}
      style={local.style}
      {...rest}
    >
      {local.content ?? local.children}
    </Dynamic>
  );
}
