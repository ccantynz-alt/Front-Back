/**
 * View Transitions API utilities for instant, zero-JS page transitions.
 * Falls back gracefully when the API is not supported.
 */

/** Feature-detect View Transitions API support. */
export function isViewTransitionSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document
  );
}

/**
 * Navigate to a new route wrapped in a View Transition.
 * If the API is unsupported, executes the navigation callback immediately.
 *
 * @param navigateFn - Callback that performs the actual route change (e.g. SolidJS navigate())
 * @returns The ViewTransition object if supported, otherwise undefined
 */
export function navigateWithTransition(
  navigateFn: () => void,
): ViewTransition | undefined {
  if (!isViewTransitionSupported()) {
    navigateFn();
    return undefined;
  }

  return document.startViewTransition(() => {
    navigateFn();
  });
}

// ── CSS class helpers for transition states ──────────────────────────

/** Add a view-transition-name to an element for named transitions. */
export function setViewTransitionName(
  element: HTMLElement,
  name: string,
): void {
  element.style.viewTransitionName = name;
}

/** Remove a view-transition-name from an element. */
export function clearViewTransitionName(element: HTMLElement): void {
  element.style.viewTransitionName = "";
}

/**
 * Apply a CSS class during a view transition, removing it when complete.
 * Useful for custom per-navigation transition classes.
 */
export function withTransitionClass(
  element: HTMLElement,
  className: string,
  navigateFn: () => void,
): void {
  if (!isViewTransitionSupported()) {
    navigateFn();
    return;
  }

  element.classList.add(className);

  const transition = document.startViewTransition(() => {
    navigateFn();
  });

  transition.finished.then(() => {
    element.classList.remove(className);
  });
}
