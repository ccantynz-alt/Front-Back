// ── /docs/components/ai-composable — AI-native component system ────
//
// Explains how the Zod component schemas in packages/schemas combine
// with the json-render renderer in apps/web/src/components/JsonRenderUI
// and the older Switch-based renderer in GenerativeUI.tsx to let AI
// agents produce validated, type-safe UI trees. The article references
// exact file paths so a curious reader can trace the chain in-repo.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
  Steps,
} from "../../../components/docs/DocsArticle";

export default function ComponentsAiComposableArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="AI-composable components"
        description="How Zod schemas in packages/schemas plus the json-render renderer in apps/web/src/components/JsonRenderUI.tsx turn the Crontech component catalog into something an AI agent can drive directly — with validation, not prompts."
        path="/docs/components/ai-composable"
      />

      <DocsArticle
        eyebrow="Components"
        title="AI-composable components"
        subtitle="The catalog is not just a library. Every primitive is paired with a Zod schema, and the schema is paired with a renderer. AI agents write JSON; Zod validates it; the renderer turns it into real components. No prompt-to-HTML. No unstructured output. No hallucinated props."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "Customisation & theming",
          href: "/docs/components/customization",
          description:
            "Theme variables, overriding styles without forking, and the right way to extend the catalog with a new primitive.",
        }}
      >
        <p>
          Generative UI is the feature that most AI platforms treat as a
          novelty — generate some HTML, slap it into a{" "}
          <code>dangerouslySetInnerHTML</code>, hope for the best. Crontech
          treats it as a core architectural concern. Agents do not write
          markup. Agents write JSON that conforms to a schema, the schema
          validates it, and a renderer maps the validated tree onto the
          real component catalog. Every pixel the AI produces is a{" "}
          <code>@back-to-the-future/ui</code> component.
        </p>

        <h2>The three pieces</h2>

        <KeyList
          items={[
            {
              term: "packages/schemas/src/components.ts",
              description:
                "Zod schemas for every component — ButtonSchema, InputSchema, CardSchema, StackSchema, TextSchema, and so on. Each schema pins the component literal, the validated prop shape, and (for containers) a recursive children array.",
            },
            {
              term: "apps/web/src/components/JsonRenderUI.tsx",
              description:
                "Production renderer built on @json-render/solid. Ships a componentRegistry keyed by the schema literal, each entry mapping a ComponentRenderProps payload onto a real @back-to-the-future/ui component. Variant values are narrowed with a runtime asEnum guard so an agent can never land an invalid prop.",
            },
            {
              term: "apps/web/src/components/GenerativeUI.tsx",
              description:
                "The earlier Switch/Match-based renderer, kept for paths that want full control over component matching. New surfaces should prefer JsonRenderUI; GenerativeUI remains supported for legacy generator outputs.",
            },
          ]}
        />

        <Callout tone="info" title="Why Zod, not freeform JSON">
          The AI is strong but not infallible. Without a schema, a model
          will occasionally hand back a <code>Button</code> with{" "}
          <code>size: "huge"</code> or a <code>Stack</code> with{" "}
          <code>direction: "diagonal"</code>. Zod catches both at the
          boundary, before the renderer runs, so the user never sees a
          broken UI from a bad token.
        </Callout>

        <h2>The end-to-end flow</h2>

        <Steps>
          <li>
            An agent is asked to produce a UI (for example, a site-builder
            pane or an in-chat action card). Its system prompt includes
            the component catalogue derived from{" "}
            <code>packages/schemas/src/components.ts</code>.
          </li>
          <li>
            The agent returns a JSON tree where every node has a{" "}
            <code>component</code> discriminant and a <code>props</code>{" "}
            object. Containers (Card, Stack) also carry a{" "}
            <code>children</code> array.
          </li>
          <li>
            <code>ComponentSchema.parse(tree)</code> runs. On failure the
            error surfaces up to the caller — usually routed back into
            the agent as a corrective turn. On success the parsed tree is
            fully typed.
          </li>
          <li>
            The validated tree is passed to the renderer. For new surfaces,
            that's the json-render Renderer driving{" "}
            <code>componentRegistry</code>; for legacy surfaces, it's{" "}
            <code>GenerativeUI.tsx</code>'s Switch/Match tree.
          </li>
          <li>
            The renderer emits real <code>@back-to-the-future/ui</code>{" "}
            components. Theme tokens, accessibility attributes, and
            keyboard behaviour come along automatically because the same
            primitives power every non-AI surface.
          </li>
        </Steps>

        <h2>A minimal agent payload</h2>
        <p>
          This is the exact shape <code>ComponentSchema.parse</code> accepts
          — identical to what the site-builder agent produces today when
          asked for a simple hero:
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
          <code>{`{
  "component": "Card",
  "props": { "padding": "lg" },
  "children": [
    {
      "component": "Stack",
      "props": { "direction": "vertical", "gap": "md" },
      "children": [
        { "component": "Text", "props": {
            "variant": "h2", "weight": "bold",
            "content": "Ship faster on the edge." } },
        { "component": "Text", "props": {
            "variant": "body",
            "content": "One platform, every layer." } },
        { "component": "Button", "props": {
            "variant": "primary", "size": "lg",
            "label": "Get started" } }
      ]
    }
  ]
}`}</code>
        </pre>

        <h2>Guard rails the system enforces</h2>

        <KeyList
          items={[
            {
              term: "Unknown components fail closed",
              description:
                "If the agent invents a component the registry does not know, the parse step rejects the tree. The renderer never sees it. No 'Unknown component' banner ever ships to a real user.",
            },
            {
              term: "Props are narrowed at runtime",
              description:
                "JsonRenderUI runs an asEnum() guard for every string-union prop (variant, size, padding, gap, direction). A nonsense value collapses to the default instead of crashing the render.",
            },
            {
              term: "Events flow through emit",
              description:
                "Interactive components (Button, Input) call props.emit('press') or props.emit('change'). The parent chat surface subscribes via useChatUI / useUIStream, so agents can react to user actions without learning DOM events.",
            },
            {
              term: "Containers recurse through the same registry",
              description:
                "Card and Stack emit their children by looping through Renderer again. You get unlimited nesting, but every leaf is still a catalog primitive — the tree can never escape into raw markup.",
            },
          ]}
        />

        <h2>Where the agents live</h2>
        <p>
          Two agent paths produce component trees in production today:
          the site-builder under <code>apps/web/src/ai/</code>, which
          renders directly into a preview pane via{" "}
          <code>GenerativeUI.tsx</code>; and the conversational chat flow
          in <code>apps/web/src/components/AIChat.tsx</code>, which
          streams JSON payloads into the <code>JsonRenderUI</code> reader.
          Both speak the same schema. Neither writes HTML.
        </p>

        <Callout tone="note">
          If you are adding a new AI surface, use{" "}
          <code>JsonRenderUI</code>. It is streaming-native, handles
          partial trees gracefully, and its componentRegistry is the one
          place to wire a new primitive end-to-end (schema → renderer
          entry → real component).
        </Callout>

        <h2>Extending the catalog for AI</h2>
        <p>
          When you add a new primitive, you add it in three places:{" "}
          <code>packages/ui/src/components/</code> for the component,{" "}
          <code>packages/schemas/src/components.ts</code> for the schema,
          and <code>apps/web/src/components/JsonRenderUI.tsx</code> for
          the renderer entry. All three gates ship in the same PR or the
          agent loses the ability to compose the new primitive safely.
          The next article walks through that process in practice.
        </p>
      </DocsArticle>
    </>
  );
}
