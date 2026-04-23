// ── /docs/components — Components category overview ────────────────
//
// Landing article for the Components category. Describes the real
// component library that ships today at `@back-to-the-future/ui`, sets
// expectations for the Zod-schema catalog that makes the library AI-
// composable, and points readers at the three follow-up articles.
// Every component mentioned is exported from `packages/ui/src/index.ts`
// — no aspirational catalog, no placeholder primitives.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function ComponentsIndexArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Components"
        description="The Crontech component library. Fifteen SolidJS primitives that ship today, each backed by a Zod schema so AI agents can discover, validate, and compose UI without ever touching raw HTML."
        path="/docs/components"
      />

      <DocsArticle
        eyebrow="Components"
        title="Components"
        subtitle="One component library, shared by the web app, the AI site-builder, and the generative UI renderer. Every primitive ships with a Zod schema so agents can discover it, validate props against it, and compose full interfaces without a single line of hand-written markup."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Catalog of shipped components",
          href: "/docs/components/catalog",
          description:
            "The fifteen primitives that ship today, their import paths, and what each one is actually for.",
        }}
      >
        <p>
          The component library lives in{" "}
          <code>packages/ui</code> and is published to the monorepo as{" "}
          <code>@back-to-the-future/ui</code>. It is a small, deliberately
          opinionated set of SolidJS primitives — fifteen of them today —
          that every Crontech surface uses: the marketing site, the
          signed-in dashboard, the AI site-builder preview pane, and the
          generative UI renderer that turns AI output into live pixels.
          There is no separate "design system repo" and no second library
          for any surface. One catalog, one source of truth.
        </p>

        <Callout tone="info" title="Zero-HTML, by design">
          You never author HTML in a Crontech app. You import a component
          from <code>@back-to-the-future/ui</code> and compose. The
          platform's AI-native architecture depends on this rule — if a
          surface uses raw <code>&lt;div&gt;</code> soup, the AI cannot
          reason about it and cannot compose into it.
        </Callout>

        <h2>What ships today</h2>
        <p>
          Fifteen primitives, grouped by role:
        </p>

        <KeyList
          items={[
            {
              term: "Layout",
              description:
                "Stack (flex container with gap + align + justify), Card (titled container with padding scale), Separator (horizontal or vertical divider).",
            },
            {
              term: "Typography",
              description:
                "Text (h1–h4, body, caption, code variants with weight + align + size). The only place tag-level styling decisions live.",
            },
            {
              term: "Forms",
              description:
                "Input (text, email, password, number, search, tel, url with label + error), Textarea (resize-controlled multi-line), Select (options + placeholder + disabled), Button (seven variants, four sizes, loading state).",
            },
            {
              term: "Feedback",
              description:
                "Alert (info / success / warning / error, dismissible), Badge (five variants, three sizes), Spinner (three sizes, accessible role=status), Tooltip (top / bottom / left / right).",
            },
            {
              term: "Overlays & navigation",
              description:
                "Modal (four sizes, escape + backdrop close, focus lock), Tabs (controlled or uncontrolled, keyboard-navigable), Avatar (image + initials fallback).",
            },
          ]}
        />

        <h2>How this category is organised</h2>
        <p>
          Three follow-up articles take you from "what exists" to "how to
          use it with AI" to "how to make it look like yours":
        </p>

        <KeyList
          items={[
            {
              term: "/docs/components/catalog",
              description:
                "The full list of shipped primitives with import paths, prop summaries, and one-line descriptions — grep-checkable against packages/ui/src/components/*.",
            },
            {
              term: "/docs/components/ai-composable",
              description:
                "How the Zod component schemas in packages/schemas/src/components.ts combine with the json-render renderer in apps/web/src/components/JsonRenderUI.tsx so AI agents can generate validated UI trees.",
            },
            {
              term: "/docs/components/customization",
              description:
                "Theme tokens (CSS variables), how to override styles without forking, and the right way to extend the catalog with a new primitive.",
            },
          ]}
        />

        <h2>The design rules the library enforces</h2>
        <p>
          Three invariants are guarded by the catalog itself. Break any
          of them and the build, the type-checker, or the AI renderer
          will tell you:
        </p>

        <KeyList
          items={[
            {
              term: "Every component has a Zod schema",
              description:
                "Defined in packages/schemas/src/components.ts and validated in both the schema test file and the AI rendering pipeline. No schema, no component.",
            },
            {
              term: "Every component is a pure function of props",
              description:
                "Signals for state, no side effects in render, no closures capturing stale values. That's what makes surgical signal-driven updates actually surgical.",
            },
            {
              term: "Every component styles through the theme layer",
              description:
                "Colours, radii, and typography come from CSS variables on :root. You never write a raw hex colour inside a component — that is a customisation decision, not a component concern.",
            },
          ]}
        />

        <Callout tone="note">
          The catalog grows deliberately. When a new primitive ships, it
          lands with a Zod schema, a rendering entry in{" "}
          <code>apps/web/src/components/JsonRenderUI.tsx</code>, and a
          test. A component that doesn't pass all three gates doesn't
          ship — that's how we keep the library small, sharp, and
          AI-trustworthy.
        </Callout>

        <h2>Where to go next</h2>
        <p>
          Start with the catalog to see what's actually in the box, then
          jump to the AI-composable article once you want to let agents
          drive the UI instead of hand-writing it.
        </p>
      </DocsArticle>
    </>
  );
}
