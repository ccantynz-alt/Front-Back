import type { JSX } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { isViewTransitionSupported, navigateWithTransition } from "../lib/view-transitions";

interface TransitionLinkProps {
  href: string;
  children: JSX.Element;
  class?: string;
  /** Optional view-transition-name for named element transitions. */
  viewTransitionName?: string;
}

/**
 * A navigation link that wraps route changes in the View Transitions API.
 * Falls back to a standard SolidJS `<A>` link when the API is not supported.
 */
export function TransitionLink(props: TransitionLinkProps): JSX.Element {
  const navigate = useNavigate();

  const handleClick = (e: MouseEvent): void => {
    // Let browser handle modified clicks (new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    // Only intercept if View Transitions are supported
    if (!isViewTransitionSupported()) {
      return;
    }

    e.preventDefault();
    navigateWithTransition(() => {
      navigate(props.href);
    });
  };

  return (
    <A
      href={props.href}
      class={props.class}
      onClick={handleClick}
      style={
        props.viewTransitionName
          ? { "view-transition-name": props.viewTransitionName }
          : undefined
      }
    >
      {props.children}
    </A>
  );
}
