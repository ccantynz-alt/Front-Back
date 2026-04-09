// ── Project Analyzer ───────────────────────────────────────────────
// Takes a component tree and returns improvement suggestions in plain English.
// Demo mode (no key needed) uses smart rule-based heuristics.
// With an API key, the same shape is produced by an LLM (future).

import type { Component } from "@back-to-the-future/schemas";

/** Narrow view of Component for property access (Component resolves to unknown via ZodType). */
interface ComponentLike {
  component: string;
  props?: Record<string, unknown>;
  children?: Component[];
}

export type SuggestionSeverity = "info" | "tip" | "warning";

export interface ProjectSuggestion {
  id: string;
  title: string;
  description: string;
  severity: SuggestionSeverity;
  // A machine-readable hint for how to apply the fix automatically.
  fix: {
    kind: "add" | "modify" | "remove";
    target?: string;
    component?: Component;
  };
}

function flatten(tree: Component[] | undefined): ComponentLike[] {
  const out: ComponentLike[] = [];
  if (!tree) return out;
  const visit = (node: Component): void => {
    const n = node as ComponentLike;
    out.push(n);
    if (Array.isArray(n.children)) {
      for (const child of n.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return out;
}

function hasComponent(tree: Component[], name: string): boolean {
  return flatten(tree).some((c) => c.component === name);
}

function hasButtonLike(tree: Component[], keywords: string[]): boolean {
  return flatten(tree).some((c) => {
    if (c.component !== "Button") return false;
    const label = ((c.props as { label?: string } | undefined)?.label ?? "").toLowerCase();
    return keywords.some((k) => label.includes(k));
  });
}

export function analyzeProject(tree: Component[]): ProjectSuggestion[] {
  const suggestions: ProjectSuggestion[] = [];

  // Rule 1: Missing CTA
  if (!hasButtonLike(tree, ["start", "sign up", "buy", "get", "try", "join", "contact"])) {
    suggestions.push({
      id: "missing-cta",
      title: "Your page is missing a call-to-action button.",
      description: "Visitors need an obvious next step. Want me to add a 'Get Started' button at the bottom?",
      severity: "tip",
      fix: {
        kind: "add",
        component: {
          component: "Button",
          props: { label: "Get Started", variant: "primary", size: "lg", disabled: false, loading: false },
        },
      },
    });
  }

  // Rule 2: No headline
  if (!flatten(tree).some((c) => c.component === "Text" && (c.props as { variant?: string } | undefined)?.variant === "h1")) {
    suggestions.push({
      id: "missing-headline",
      title: "There is no main headline on this page.",
      description: "Pages with a clear H1 headline convert better. Shall I add one at the top?",
      severity: "warning",
      fix: {
        kind: "add",
        component: {
          component: "Text",
          props: { content: "Welcome", variant: "h1", weight: "bold", align: "center" },
        },
      },
    });
  }

  // Rule 3: No images / avatars / visual content
  if (!hasComponent(tree, "Avatar") && !hasComponent(tree, "Card")) {
    suggestions.push({
      id: "needs-visuals",
      title: "This page is text-only.",
      description: "Adding visual cards or imagery makes pages feel friendlier. Want me to add a feature grid?",
      severity: "tip",
      fix: { kind: "add" },
    });
  }

  // Rule 4: No contact form
  if (!hasComponent(tree, "Input") && !hasComponent(tree, "Textarea")) {
    suggestions.push({
      id: "add-contact-form",
      title: "Add a contact form?",
      description: "Letting visitors reach out is one of the easiest ways to grow. Shall I add a contact form?",
      severity: "info",
      fix: {
        kind: "add",
        component: {
          component: "Input",
          props: { name: "email", type: "email", label: "Your email", required: true, disabled: false },
        },
      },
    });
  }

  // Rule 5: Spacing — too many siblings without a Stack wrapper
  if (tree.length > 4 && !hasComponent(tree, "Stack")) {
    suggestions.push({
      id: "needs-spacing",
      title: "This section could use better spacing.",
      description: "Wrapping your content in a Stack with consistent gaps will make it look polished. Shall I fix it?",
      severity: "tip",
      fix: { kind: "modify" },
    });
  }

  // Rule 6: Mobile-friendly check (very rough — just a recommendation)
  const wideStacks = flatten(tree).filter(
    (c) =>
      c.component === "Stack" &&
      (c.props as { direction?: string } | undefined)?.direction === "horizontal" &&
      Array.isArray(c.children) &&
      (c.children?.length ?? 0) > 3,
  );
  if (wideStacks.length > 0) {
    suggestions.push({
      id: "mobile-friendly",
      title: "Make this mobile-friendly?",
      description: "You have wide horizontal layouts that may break on phones. Want me to make them stack vertically on small screens?",
      severity: "tip",
      fix: { kind: "modify" },
    });
  }

  return suggestions;
}

// Future: AI-powered analyzer that calls LLM with the component tree.
// Falls back to rule-based when no API key is configured.
export async function analyzeProjectWithAI(tree: Component[]): Promise<ProjectSuggestion[]> {
  // Demo mode: rule-based always.
  return analyzeProject(tree);
}
