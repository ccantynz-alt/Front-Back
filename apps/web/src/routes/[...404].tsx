import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

const suggestions = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/builder", label: "Composer" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/about", label: "About" },
];

export default function NotFound(): JSX.Element {
  return (
    <>
      <Title>404 — Lost in the timeline | Crontech</Title>
      <Stack direction="vertical" align="center" justify="center" class="page-center">
        <Card padding="lg" class="not-found-card">
          <Stack direction="vertical" gap="lg" align="center">
            <Text variant="h1" weight="bold" class="not-found-code">
              404
            </Text>
            <Text variant="h3" weight="semibold" align="center">
              You're two years ahead of this page.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              We looked everywhere — edge, client, cloud. This URL isn't here.
              Either the link is broken, or we haven't built it yet.
            </Text>
            <Stack direction="horizontal" gap="md" justify="center">
              <A href="/">
                <Button variant="primary" size="lg">Back to home</Button>
              </A>
              <A href="/dashboard">
                <Button variant="outline" size="lg">Open dashboard</Button>
              </A>
            </Stack>
            <Text variant="caption" class="text-muted">Or jump to a popular destination:</Text>
            <div class="not-found-links">
              {suggestions.map((s) => (
                <A href={s.href}>{s.label}</A>
              ))}
            </div>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
