import { type JSX, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

/**
 * Box — the lowest-level structural primitive.
 *
 * Replaces raw `<div>` / `<section>` / `<header>` / `<main>` / `<aside>` /
 * `<nav>` / `<footer>` / `<article>` calls across the app. The doctrine
 * (CLAUDE.md §6) is "everything is components" — Box is the typed escape
 * hatch for cases where Stack / Card / Container don't match.
 *
 * Use Stack instead when you want flex layout.
 * Use Container instead when you want centered max-width.
 * Use Card instead when you want elevation / surface treatment.
 * Use Box only when you genuinely need a typed semantic wrapper.
 */
export interface BoxProps {
  as?:
    | "div"
    | "section"
    | "header"
    | "main"
    | "aside"
    | "nav"
    | "footer"
    | "article"
    | "figure"
    | "summary"
    | "details";
  class?: string;
  style?: JSX.CSSProperties | string;
  id?: string;
  /** ARIA role — typed via JSX HTMLAttributes for SolidJS compatibility. */
  role?: JSX.HTMLAttributes<HTMLElement>["role"];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-hidden"?: boolean | "true" | "false";
  children?: JSX.Element;
  onClick?: (e: MouseEvent) => void;
}

export function Box(props: BoxProps): JSX.Element {
  const [local, rest] = splitProps(props, ["as", "class", "style", "children"]);
  const tag = (): BoxProps["as"] => local.as ?? "div";
  return (
    <Dynamic
      component={tag()}
      class={local.class}
      style={local.style as JSX.CSSProperties | undefined}
      {...rest}
    >
      {local.children}
    </Dynamic>
  );
}
