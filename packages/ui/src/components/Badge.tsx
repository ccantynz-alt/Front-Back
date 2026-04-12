import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md" | "lg";
  label?: string;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

export function Badge(props: BadgeProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "label",
    "class",
    "style",
    "children",
  ]);

  return (
    <span
      class={`badge badge-${local.variant ?? "default"} badge-${local.size ?? "md"} ${local.class ?? ""}`}
      style={local.style}
      role="status"
      {...rest}
    >
      {local.label ?? local.children}
    </span>
  );
}
