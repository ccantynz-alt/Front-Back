// ── /docs/components/customization — Theme + extension guide ───────
//
// Closes out the Components category with the two questions every
// library eventually has to answer: how do I restyle what you shipped,
// and how do I add something you didn't. Leans on the theme-variable
// approach the library already uses (CSS custom properties on :root)
// and spells out the three-gate extension rule introduced in the
// ai-composable article.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
  Steps,
} from "../../../components/docs/DocsArticle";

export default function ComponentsCustomizationArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Customization & theming"
        description="How to restyle Crontech components via theme variables, override single call sites without forking, and extend the catalog with a new primitive — passing all three shipping gates."
        path="/docs/components/customization"
      />

      <DocsArticle
        eyebrow="Components"
        title="Customisation &amp; theming"
        subtitle="Two honest answers. The library ships with a theme-variable system for the 90% case — change a token, watch every component update — and a three-gate extension rule for when you need a primitive that isn't in the catalog yet."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Back to the catalog",
          href: "/docs/components/catalog",
          description:
            "Jump back to the list of shipped primitives, or head up to /docs for the next category.",
        }}
      >
        <p>
          The library leans hard on CSS custom properties. Every primitive
          reaches for tokens like <code>var(--color-primary)</code>,{" "}
          <code>var(--color-bg-subtle)</code>, and{" "}
          <code>var(--color-text)</code> instead of baking a specific
          colour into the component source. That means two things: one,
          retheming the whole platform is a single edit on{" "}
          <code>:root</code>. Two, you rarely need to fork a component —
          you only need to override a token.
        </p>

        <h2>The theme tokens</h2>
        <p>
          Every token lives on <code>:root</code> in the web app's global
          stylesheet. Here is the short-list of tokens you will reach for
          most often:
        </p>

        <KeyList
          items={[
            {
              term: "Surface",
              description:
                "--color-bg (page background), --color-bg-subtle (cards, insets, inputs), --color-bg-elevated (popovers, modals).",
            },
            {
              term: "Text",
              description:
                "--color-text (primary), --color-text-secondary (body copy), --color-text-muted (captions, sub-labels), --color-text-faint (hints, placeholders).",
            },
            {
              term: "Accents",
              description:
                "--color-primary, --color-primary-hover (hover + active), --color-success, --color-warning, --color-danger, --color-info.",
            },
            {
              term: "Borders",
              description:
                "--color-border (default), --color-border-strong (hovered, focused, or emphasised surfaces).",
            },
          ]}
        />

        <Callout tone="info">
          Dark mode is not a separate stylesheet. It is the same set of
          tokens with different values in{" "}
          <code>@media (prefers-color-scheme: dark)</code>. Add your
          tokens to both branches and every primitive adopts the new
          palette automatically.
        </Callout>

        <h2>Rebranding in one block</h2>
        <p>
          To reskin every Crontech surface for your own brand, override
          the tokens on <code>:root</code> (or scope them to a wrapper
          element if you are embedding inside another app):
        </p>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`:root {
  /* Accents */
  --color-primary: oklch(0.72 0.18 258);
  --color-primary-hover: oklch(0.66 0.18 258);

  /* Surfaces */
  --color-bg: oklch(0.99 0 0);
  --color-bg-subtle: oklch(0.97 0 0);
  --color-bg-elevated: oklch(1 0 0);

  /* Text */
  --color-text: oklch(0.18 0 0);
  --color-text-muted: oklch(0.46 0 0);
}`}</code>
        </pre>

        <h2>Overriding a single call site</h2>
        <p>
          Every primitive accepts a <code>class</code> prop and (where
          relevant) a <code>style</code> prop. Use them for one-off
          tweaks — not for themes:
        </p>

        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`import { Card } from "@back-to-the-future/ui";

<Card
  padding="lg"
  class="hero-card"
  style={{ "border-radius": "1.25rem" }}
>
  {/* ... */}
</Card>`}</code>
        </pre>

        <Callout tone="warn" title="Do not fork the library for a colour">
          If you find yourself copy-pasting a component into your app to
          change a border or a hover, stop. Almost every such change is a
          theme-token override. Forking a primitive breaks the AI
          composability contract — the renderer still hands AI output to
          the catalog version, not your fork, so your "improvement"
          silently vanishes for anything the agent renders.
        </Callout>

        <h2>Extending the catalog with a new primitive</h2>
        <p>
          When a primitive genuinely does not exist yet, the library has
          room for it. But the bar for shipping a new component is three
          gates — the same three gates every existing primitive passed.
          Miss any one and the component is not considered shipped.
        </p>

        <Steps>
          <li>
            <strong>Component.</strong> Add the SolidJS implementation at{" "}
            <code>packages/ui/src/components/YourThing.tsx</code> and
            export it from <code>packages/ui/src/index.ts</code>. Use
            theme tokens, never hard-coded colours. Keep props to a
            serialisable shape (strings, numbers, booleans, enums) — AI
            cannot compose over closures.
          </li>
          <li>
            <strong>Schema.</strong> Add{" "}
            <code>YourThingSchema</code> to{" "}
            <code>packages/schemas/src/components.ts</code> and extend
            the discriminated <code>ComponentSchema</code> union so the
            parser knows about it. Constrain enum props with{" "}
            <code>z.enum</code> — that's how the AI is guaranteed to hand
            back a valid variant.
          </li>
          <li>
            <strong>Renderer entry.</strong> Add a{" "}
            <code>YourThing</code> entry to the{" "}
            <code>componentRegistry</code> in{" "}
            <code>apps/web/src/components/JsonRenderUI.tsx</code>. Use
            the same <code>asEnum</code> helper the existing entries use
            — never trust a raw string off the model.
          </li>
        </Steps>

        <p>
          Once all three gates are in place, a short test in your feature
          branch — mount the component, parse a fixture schema, pass it
          through <code>JsonRenderUI</code>, snapshot the output — is the
          final guard. If the test passes, AI agents can compose with
          your new primitive from their next turn onward.
        </p>

        <Callout tone="note">
          A new component with a real schema and a real renderer entry
          will show up in the catalog article automatically on the next
          docs sweep. Please open a PR for the catalog article at the
          same time — keep the docs honest with the source.
        </Callout>

        <h2>You are done with the category</h2>
        <p>
          Between the overview, the catalog, the AI-composable guide, and
          this customisation article, you have everything required to
          build a full surface on the library, retheme it for your brand,
          and let AI agents drive it safely. The next unshipped docs
          category lands the moment its subsystem stabilises — come back
          to <a href="/docs">/docs</a> to see what's new.
        </p>
      </DocsArticle>
    </>
  );
}
