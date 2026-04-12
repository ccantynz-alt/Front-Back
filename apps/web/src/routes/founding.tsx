import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// Placeholder Founding Member route. A richer version is being built in a
// parallel worktree (Agent 3) and will supersede this file at merge time.
// Exists here only so the landing page link resolves and check-links passes.

export default function Founding(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Founding Member — Crontech"
        description="Founding Member cohort for Crontech, the compliance-native developer platform for AI SaaS. First 100 seats only."
        path="/founding"
      />
      <Stack direction="vertical" gap="xl" class="page-padded">
        <Stack direction="vertical" align="center" justify="center" gap="md" class="hero">
          <Badge variant="info" size="sm">First 100 seats only</Badge>
          <Text variant="h1" weight="bold" align="center" class="heading">
            Founding Member cohort.
          </Text>
          <Text variant="body" align="center" class="tagline">
            Claim an early seat on the compliance-native developer platform for AI SaaS.
          </Text>
        </Stack>
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="body" class="text-muted" align="center">
              The Founding Member cohort opens with full access to SOC 2-ready primitives, encrypted-at-rest Postgres, hash-chained audit logs, and the polyglot runtime.
            </Text>
            <Stack direction="horizontal" gap="sm" justify="center">
              <A href="/register">
                <Button variant="primary" size="lg">Create an account</Button>
              </A>
              <A href="/">
                <Button variant="outline" size="lg">Back to home</Button>
              </A>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
