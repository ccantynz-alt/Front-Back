import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface CardProps {
  title?: string | undefined;
  description?: string | undefined;
  padding?: "none" | "sm" | "md" | "lg" | undefined;
  class?: string | undefined;
  style?: JSX.CSSProperties | undefined;
  children?: JSX.Element | undefined;
}

export function Card(props: CardProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "title",
    "description",
    "padding",
    "class",
    "style",
    "children",
  ]);

  return (
    <div
      class={`card card-padding-${local.padding ?? "md"} ${local.class ?? ""}`}
      style={local.style}
      {...rest}
    >
      {local.title && <h3 class="card-title">{local.title}</h3>}
      {local.description && <p class="card-description">{local.description}</p>}
      {local.children}
    </div>
  );
}
