// ── /docs/components/catalog — Real component inventory ────────────
//
// Enumerates every primitive exported by `@back-to-the-future/ui` today
// with its import path, what it's actually for, and the props you'll
// reach for first. Every entry is grep-checkable in
// packages/ui/src/components/*.tsx — no made-up components, no
// aspirational props. When the catalog grows, this article grows with
// it, under doctrine §0.10 fix-on-sight.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function ComponentsCatalogArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Component catalog"
        description="The fifteen primitives that ship in @back-to-the-future/ui today, with import paths, prop summaries, and what each one is for."
        path="/docs/components/catalog"
      />

      <DocsArticle
        eyebrow="Components"
        title="The catalog"
        subtitle="Every component that ships today, straight from packages/ui/src/components/*. Import paths are real. Prop lists come from the actual TypeScript interfaces. If an entry here drifts from the source, it is a doc bug."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "AI-composable components",
          href: "/docs/components/ai-composable",
          description:
            "How Zod schemas plus the json-render renderer turn this catalog into something an AI agent can drive directly.",
        }}
      >
        <p>
          Everything below imports from a single package entry point:
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
          <code>{`import {
  Button, Input, Card, Stack, Text, Modal,
  Badge, Alert, Avatar, Tabs, Select, Textarea,
  Spinner, Tooltip, Separator,
} from "@back-to-the-future/ui";`}</code>
        </pre>

        <Callout tone="info">
          There is no per-component import path. The library is small
          enough to tree-shake cleanly from a single entry point, and
          keeping imports flat makes the AI composable surface simpler —
          one import, fifteen component names, nothing to guess.
        </Callout>

        <h2>Layout primitives</h2>

        <KeyList
          items={[
            {
              term: "Stack",
              description:
                "Flex container. Props: direction (horizontal | vertical), gap (none..xl), align (start | center | end | stretch), justify (start | center | end | between | around). This is how you compose rows and columns without writing a single flex utility class.",
            },
            {
              term: "Card",
              description:
                "Titled container. Props: title, description, padding (none | sm | md | lg). Optional children slot in below the heading pair. Used everywhere from dashboard metric tiles to marketing pricing cards.",
            },
            {
              term: "Separator",
              description:
                "Divider line. Props: orientation (horizontal | vertical). Renders with role=separator and the matching aria-orientation — screen readers announce it correctly out of the box.",
            },
          ]}
        />

        <h2>Typography</h2>

        <KeyList
          items={[
            {
              term: "Text",
              description:
                "The only component that decides what tag to render. Props: variant (h1 | h2 | h3 | h4 | body | caption | code), optional as override (span | p | div | label | strong | …), weight (normal | medium | semibold | bold), align (left | center | right), size (xs | sm | md | lg). If you reach for a raw h2 anywhere, use Text variant=\"h2\" instead.",
            },
          ]}
        />

        <h2>Forms</h2>

        <KeyList
          items={[
            {
              term: "Input",
              description:
                "Single-line input. Extends the native input element. Props: label, error, plus every standard input attribute (type, placeholder, value, onInput, required, disabled, …). The error prop renders a styled message below the field.",
            },
            {
              term: "Textarea",
              description:
                "Multi-line input. Extends the native textarea. Props: label, error, resize (none | vertical | horizontal | both).",
            },
            {
              term: "Select",
              description:
                "Dropdown. Props: options (array of { value, label, disabled? }), value, placeholder, label, error, disabled, name, onChange. Controlled via a single string value — no arrays, no complex selection state.",
            },
            {
              term: "Button",
              description:
                "Action. Props: variant (default | primary | secondary | destructive | outline | ghost | link), size (sm | md | lg | icon), loading (boolean). Extends all native button attributes. When loading is true the button is disabled and renders 'Loading...' — no manual spinner plumbing required.",
            },
          ]}
        />

        <h2>Feedback</h2>

        <KeyList
          items={[
            {
              term: "Alert",
              description:
                "Inline notice. Props: variant (info | success | warning | error), title, description, dismissible (boolean). Children slot in below the title for richer bodies.",
            },
            {
              term: "Badge",
              description:
                "Compact status tag. Props: variant (default | success | warning | error | info), size (sm | md | lg), label (string shortcut for children).",
            },
            {
              term: "Spinner",
              description:
                "Loading indicator. Props: size (sm | md | lg). Rendered with role=status and aria-label=\"Loading\" — safe to drop in anywhere without worrying about accessibility.",
            },
            {
              term: "Tooltip",
              description:
                "Contextual label. Props: content (string), position (top | bottom | left | right), plus children (the trigger element). Visibility is controlled by hover and focus, not by a manual open flag.",
            },
          ]}
        />

        <h2>Overlays &amp; navigation</h2>

        <KeyList
          items={[
            {
              term: "Modal",
              description:
                "Dialog. Props: open (boolean), title, description, size (sm | md | lg | xl), onClose. Escape key and backdrop click both call onClose; body scroll locks while the modal is open.",
            },
            {
              term: "Tabs",
              description:
                "Tab set. Props: items (array of { id, label, content?, disabled? }), defaultTab, onChange. Rendering is keyboard-navigable and the active panel is the only one mounted.",
            },
            {
              term: "Avatar",
              description:
                "User image. Props: src, alt, initials, size (sm | md | lg). When src fails to load it gracefully falls back to the initials — no broken image icon ever renders.",
            },
          ]}
        />

        <h2>A minimal composition</h2>
        <p>
          A sign-up card assembled from five primitives, zero raw HTML
          tags, and one import line:
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
          <code>{`import {
  Card, Stack, Text, Input, Button,
} from "@back-to-the-future/ui";

export function SignupCard() {
  return (
    <Card title="Create your account" padding="lg">
      <Stack direction="vertical" gap="md">
        <Text variant="body">
          Passkey, Google, or classic email + password.
        </Text>
        <Input type="email" label="Email" name="email" required />
        <Input type="password" label="Password" name="password" required />
        <Button variant="primary" size="lg" type="submit">Create account</Button>
      </Stack>
    </Card>
  );
}`}</code>
        </pre>

        <Callout tone="note">
          Everything in this article is grep-checkable. If a prop name or
          a variant doesn't match <code>packages/ui/src/components/</code>,
          treat it as a doc bug and fix the article — the component file
          is the source of truth.
        </Callout>

        <h2>What's next for the catalog</h2>
        <p>
          Richer primitives — DataTable, Drawer, Command, DatePicker —
          are queued and ship one-at-a-time under the same three-gate
          rule: Zod schema, json-render renderer entry, and test. The
          moment each lands, it shows up here.
        </p>
      </DocsArticle>
    </>
  );
}
