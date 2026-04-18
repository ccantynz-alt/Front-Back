import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// Founding Member landing page. Per docs/POSITIONING.md:
//   - Audience is UNIVERSAL (no vertical cutoff)
//   - Tone is POLITE (no competitor names)
//   - Headline direction is forward-looking, not adversarial
// This page previously framed Crontech as "compliance-native for AI SaaS",
// which muddied the positioning. Reframed to match the locked doctrine.

export default function Founding(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Founding Member — Crontech"
        description="Join the Founding Member cohort for Crontech, the developer platform for the next decade. Limited to the first 100 seats."
        path="/founding"
      />
      <Stack direction="vertical" gap="xl" class="page-padded">
        <Stack direction="vertical" align="center" justify="center" gap="md" class="hero">
          <Badge variant="info" size="sm">First 100 seats only</Badge>
          <Text variant="h1" weight="bold" align="center" class="heading">
            Founding Member cohort.
          </Text>
          <Text variant="body" align="center" class="tagline">
            An early seat on the developer platform for the next decade.
          </Text>
        </Stack>
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="body" class="text-muted" align="center">
              Founding Members get full access to every layer of Crontech from day one —
              edge compute, unified data, type-safe APIs, real-time collaboration, the
              AI runtime, and admin — on one platform with one dashboard and one bill.
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
