import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Stack, Text, Card, Badge, Separator } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

/* ------------------------------------------------------------------ */
/*  Data structures                                                    */
/* ------------------------------------------------------------------ */

interface AICapability {
  title: string;
  description: string;
  icon: string;
}

interface ComputeTier {
  name: string;
  tagline: string;
  icon: string;
  badge: string;
  badgeVariant: "success" | "info" | "warning";
  latency: string;
  cost: string;
  details: string[];
  highlight?: boolean;
}

interface DataCommitment {
  title: string;
  description: string;
  icon: string;
}

interface UserControl {
  action: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Static content                                                     */
/* ------------------------------------------------------------------ */

const aiCapabilities: AICapability[] = [
  {
    title: "Code Generation & Development Assistance",
    description:
      "AI assists with code completion, refactoring suggestions, bug detection, and architecture recommendations. It accelerates development while keeping you in full control of every line shipped.",
    icon: "\u{1F4BB}",
  },
  {
    title: "Website Building & Design Suggestions",
    description:
      "Our AI website builder agent composes pages from validated component schemas. It suggests layouts, color palettes, typography, and responsive structures — all generated from a curated, type-safe catalog.",
    icon: "\u{1F3A8}",
  },
  {
    title: "Video Processing & Effects",
    description:
      "WebGPU-accelerated video encoding, decoding, and effects processing runs directly in your browser. Transitions, filters, and compositing happen on your device GPU before anything touches a server.",
    icon: "\u{1F3AC}",
  },
  {
    title: "Real-Time Collaboration",
    description:
      "AI agents participate in collaborative editing sessions as first-class peers alongside human users. They suggest edits, catch conflicts, auto-format content, and generate assets in real time via CRDTs.",
    icon: "\u{1F91D}",
  },
  {
    title: "Semantic Search & Content Understanding",
    description:
      "Every data store is automatically vector-indexed. Search understands meaning, not just keywords. Retrieval-Augmented Generation (RAG) pipelines provide contextual, accurate answers from your own content.",
    icon: "\u{1F50D}",
  },
  {
    title: "Predictive Data Prefetching",
    description:
      "The platform learns which data you are likely to request next and preloads it before you ask. Repeat access patterns converge toward near-zero perceived latency.",
    icon: "\u{26A1}",
  },
  {
    title: "Error Recovery & Self-Healing",
    description:
      "AI-powered error boundaries diagnose failures, identify root causes, and attempt automatic recovery before surfacing issues to you. Downtime is minimized by design.",
    icon: "\u{1F6E1}\uFE0F",
  },
];

const computeTiers: ComputeTier[] = [
  {
    name: "Client-Side (WebGPU)",
    tagline: "Your device. Your data. Zero transmission.",
    icon: "\u{1F4F1}",
    badge: "$0 / token",
    badgeVariant: "success",
    latency: "Sub-10ms",
    cost: "$0",
    highlight: true,
    details: [
      "Runs entirely in your browser via WebGPU acceleration",
      "Your data NEVER leaves your device — zero network transmission",
      "Models are downloaded once and cached locally on your machine",
      "Handles summarization, classification, embeddings, and small completions",
      "Falls back gracefully if your device does not support WebGPU",
      "No API calls, no server round-trips, no cloud dependency",
    ],
  },
  {
    name: "Edge (Cloudflare Workers AI)",
    tagline: "Processed at the nearest edge node to you.",
    icon: "\u{1F310}",
    badge: "Sub-50ms",
    badgeVariant: "info",
    latency: "Sub-50ms",
    cost: "Included",
    details: [
      "Requests are routed to the nearest of 330+ edge locations worldwide",
      "Data is processed according to our Privacy Policy and discarded after use",
      "Handles mid-range AI tasks that exceed client-side GPU capability",
      "No cold starts — always warm, always fast",
      "Edge replicas of your data minimize cross-region data movement",
    ],
  },
  {
    name: "Cloud (GPU Clusters)",
    tagline: "Full power for heavy workloads. Secure and ephemeral.",
    icon: "\u{2601}\uFE0F",
    badge: "Full Power",
    badgeVariant: "warning",
    latency: "Sub-2s",
    cost: "Usage-based",
    details: [
      "H100 GPU clusters handle heavy inference, fine-tuning, and video processing",
      "Data is processed in secure data centers with AES-256 encryption",
      "Processing data is ephemeral — discarded after the response, not stored",
      "Scale-to-zero architecture means no idle resources and no wasted cost",
      "Used only when client-side and edge tiers cannot meet the request requirements",
    ],
  },
];

const dataCommitments: DataCommitment[] = [
  {
    title: "We Do NOT Train on Your Content",
    description:
      "Your projects, code, designs, documents, and creative work are never used to train, fine-tune, or improve AI models. Your intellectual property remains yours — completely.",
    icon: "\u{1F6AB}",
  },
  {
    title: "Client-Side AI = Zero Data Transmission",
    description:
      "When AI runs on your device via WebGPU, absolutely no data is sent to any server. The model executes locally. Your prompts, your content, your results — all stay on your machine.",
    icon: "\u{1F512}",
  },
  {
    title: "Server-Side AI = Processed, Not Retained",
    description:
      "When requests are handled by edge or cloud tiers, your data is processed according to our Privacy Policy, used to generate a response, and then discarded. It is not logged, stored, or used for training.",
    icon: "\u{1F5D1}\uFE0F",
  },
  {
    title: "You Own ALL AI-Generated Output",
    description:
      "Code, designs, content, video effects, layouts — everything the AI generates for you belongs to you. You retain full intellectual property rights over all AI-assisted and AI-generated output.",
    icon: "\u{1F4DC}",
  },
];

const aiLimitations: string[] = [
  "AI may produce incorrect, incomplete, outdated, or biased results. Always verify critical output independently.",
  "AI-generated code should be reviewed and tested before deployment to production environments.",
  "AI is a tool that augments your capabilities — it is not a replacement for professional judgment, legal advice, medical guidance, or domain expertise.",
  "We continuously improve accuracy, reduce bias, and expand capability, but we cannot and do not guarantee perfection.",
  "AI agents participating in collaboration sessions may suggest changes that conflict with your intent. You always have final approval.",
  "Client-side AI performance depends on your device hardware. Results may vary across different GPUs and browsers.",
];

const modelProviders: string[] = [
  "We use models from OpenAI, Anthropic, open-source communities (including Meta Llama, Mistral, and others), and proprietary models optimized for specific tasks.",
  "The platform indicates which compute tier is processing each request so you always know where your data is being handled.",
  "Model selection is automatic and based on task requirements, device capability, and latency constraints — the system routes to the cheapest tier that meets all requirements.",
  "Open-source models power client-side inference so that local AI is transparent, auditable, and free from vendor lock-in.",
];

const userControls: UserControl[] = [
  {
    action: "Disable AI features entirely",
    description:
      "Turn off all AI-powered functionality across the platform from your account Settings. The platform remains fully functional for manual workflows.",
  },
  {
    action: "Disable client-side AI per device",
    description:
      "Prevent WebGPU-based AI models from downloading and executing on specific devices. Useful for shared or resource-constrained machines.",
  },
  {
    action: "Choose compute tier preferences",
    description:
      "Set a preferred compute tier (client-only, edge-allowed, cloud-allowed) to control where your AI requests are processed.",
  },
  {
    action: "Delete AI interaction history",
    description:
      "Permanently delete all records of your AI interactions, prompts, and generated outputs from our systems at any time.",
  },
  {
    action: "Export your data",
    description:
      "Download a complete copy of your data — including AI interaction history, generated assets, and account information — in standard, portable formats.",
  },
];

const complianceFrameworks: string[] = [
  "NIST AI Risk Management Framework (AI RMF 1.0) — We follow the Govern, Map, Measure, and Manage functions to identify and mitigate AI risks across our platform.",
  "EU AI Act transparency requirements — We classify our AI systems by risk level and maintain the documentation, logging, and human oversight obligations required by the regulation.",
  "DRAFT — requires attorney review. Bias and safety audits — We intend to engage independent AI safety auditors prior to general availability. Until then, internal review is in place but independent third-party audits have not yet commenced. We do not currently have a contracted external audit partner.",
  "AI system documentation — We maintain technical documentation of all AI models deployed on the platform, including their intended purpose, training data provenance (where disclosed by providers), known limitations, and performance metrics.",
  "Human oversight — All destructive AI actions (file deletion, code deployment, data modification) require explicit human approval before execution.",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AIDisclosurePage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="AI Transparency & Disclosure"
        description="How Crontech uses AI across every layer of the platform — client-side, edge, and cloud. Our commitment to transparency, data privacy, and user control."
        path="/legal/ai-disclosure"
      />

      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        {/* ---- Header ---- */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">
            AI Transparency & Disclosure
          </Text>
          <Text variant="caption" class="text-muted">
            Last updated: April 8, 2026
          </Text>
        </Stack>

        {/* ---- 1. Commitment ---- */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h2" weight="bold">
              Our Commitment to AI Transparency
            </Text>
            <Text variant="body">
              Crontech is an AI-native platform. AI is not a bolt-on feature — it
              is woven into every layer of the architecture, from client-side
              inference running on your GPU to edge-deployed intelligence to
              cloud-scale processing. We believe that depth of integration demands
              an equal depth of transparency.
            </Text>
            <Text variant="body">
              This page explains exactly how AI operates within Crontech: what it
              does, where it runs, what data it touches, what it does not do, and
              how you stay in control. No vague language. No hand-waving. If you
              have a question this page does not answer, contact us at{" "}
              <Text variant="code" class="text-muted">
                ai@crontech.dev
              </Text>{" "}
              and we will update this disclosure.
            </Text>
          </Stack>
        </Card>

        <Separator />

        {/* ---- 2. How AI Powers Crontech ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            How AI Powers Crontech
          </Text>
          <Text variant="body">
            AI participates in the following areas of the platform. Each
            capability is designed to augment your work — never to replace your
            judgment or act without your awareness.
          </Text>
          <Stack direction="vertical" gap="sm">
            <For each={aiCapabilities}>
              {(cap) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="xs">
                    <Text variant="h4" weight="semibold">
                      {cap.icon}{" "}{cap.title}
                    </Text>
                    <Text variant="body">{cap.description}</Text>
                  </Stack>
                </Card>
              )}
            </For>
          </Stack>
        </Stack>

        <Separator />

        {/* ---- 3. Three-Tier Compute Model ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            Three-Tier Compute Model
          </Text>
          <Text variant="body">
            Crontech automatically routes AI workloads across three compute tiers
            based on model size, device capability, and latency requirements. The
            platform always selects the most private, most cost-effective tier
            that can fulfill your request.
          </Text>
          <Stack direction="vertical" gap="sm">
            <For each={computeTiers}>
              {(tier) => (
                <Card
                  padding="lg"
                  class={
                    tier.highlight
                      ? "border-2 border-green-500/40 bg-green-950/10"
                      : ""
                  }
                >
                  <Stack direction="vertical" gap="sm">
                    <Stack direction="horizontal" gap="sm" align="center">
                      <Text variant="h3" weight="bold">
                        {tier.icon}{" "}{tier.name}
                      </Text>
                      <Badge variant={tier.badgeVariant} size="sm">
                        {tier.badge}
                      </Badge>
                    </Stack>
                    <Text variant="body" weight="medium">
                      {tier.tagline}
                    </Text>
                    <Stack direction="horizontal" gap="md">
                      <Text variant="caption" class="text-muted">
                        Latency: {tier.latency}
                      </Text>
                      <Text variant="caption" class="text-muted">
                        Cost: {tier.cost}
                      </Text>
                    </Stack>
                    <Stack direction="vertical" gap="xs">
                      <For each={tier.details}>
                        {(detail) => (
                          <Text variant="body" class="text-muted">
                            {"\u2022"} {detail}
                          </Text>
                        )}
                      </For>
                    </Stack>
                    {tier.highlight && (
                      <Badge variant="success" size="sm">
                        Privacy Maximum — Data never leaves your device
                      </Badge>
                    )}
                  </Stack>
                </Card>
              )}
            </For>
          </Stack>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <Text variant="h4" weight="semibold">
                Automatic Fallback Chain
              </Text>
              <Text variant="body">
                If your device cannot handle a request, the edge picks it up.
                If the edge cannot handle it, the cloud picks it up. If the
                cloud is overloaded, the request is queued — never dropped.
                You always get a result.
              </Text>
            </Stack>
          </Card>
        </Stack>

        <Separator />

        {/* ---- 4. Your Data & AI ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            Your Data & AI
          </Text>
          <Stack direction="vertical" gap="sm">
            <For each={dataCommitments}>
              {(commitment) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="xs">
                    <Text variant="h4" weight="semibold">
                      {commitment.icon}{" "}{commitment.title}
                    </Text>
                    <Text variant="body">{commitment.description}</Text>
                  </Stack>
                </Card>
              )}
            </For>
          </Stack>
        </Stack>

        <Separator />

        {/* ---- 5. AI Limitations & Responsibilities ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            AI Limitations & Responsibilities
          </Text>
          <Text variant="body">
            We are committed to honesty about what AI can and cannot do. The
            following limitations apply to all AI features on the platform.
          </Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <For each={aiLimitations}>
                {(limitation) => (
                  <Text variant="body" class="text-muted">
                    {"\u2022"} {limitation}
                  </Text>
                )}
              </For>
            </Stack>
          </Card>
        </Stack>

        <Separator />

        {/* ---- 6. Models & Providers ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            Models & Providers
          </Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <For each={modelProviders}>
                {(item) => (
                  <Text variant="body" class="text-muted">
                    {"\u2022"} {item}
                  </Text>
                )}
              </For>
            </Stack>
          </Card>
        </Stack>

        <Separator />

        {/* ---- 7. User Controls ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            User Controls
          </Text>
          <Text variant="body">
            You are always in control of how AI interacts with your account and
            data. The following controls are available in your account Settings.
          </Text>
          <Stack direction="vertical" gap="sm">
            <For each={userControls}>
              {(control) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="xs">
                    <Text variant="h4" weight="semibold">
                      {control.action}
                    </Text>
                    <Text variant="body">{control.description}</Text>
                  </Stack>
                </Card>
              )}
            </For>
          </Stack>
        </Stack>

        <Separator />

        {/* ---- 8. Regulatory Compliance ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            Regulatory Compliance
          </Text>
          <Text variant="body">
            Crontech maintains compliance with leading AI governance frameworks
            and prepares proactively for emerging regulations.
          </Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <For each={complianceFrameworks}>
                {(framework) => (
                  <Text variant="body" class="text-muted">
                    {"\u2022"} {framework}
                  </Text>
                )}
              </For>
            </Stack>
          </Card>
        </Stack>

        <Separator />

        {/* ---- 8.5 Additional Protections - DRAFT ---- */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold">
            Additional Protections (DRAFT &mdash; requires attorney review)
          </Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <Text variant="body">
                DRAFT &mdash; requires attorney review. Nothing on this AI
                Transparency & Disclosure page waives, diminishes, or
                otherwise limits any protection, disclaimer, limitation of
                liability, indemnification, class-action waiver,
                binding-arbitration clause, AS-IS / AS-AVAILABLE
                disclaimer, no-consequential-damages exclusion,
                governing-law choice, export-controls clause, 18+ age
                requirement, or 30-day notice provision set forth in the
                Terms of Service. All such Terms of Service provisions
                apply with full force to your use of AI features.
              </Text>
              <Text variant="body">
                AI Output Disclaimer. Reaffirming the AI Limitations
                section above: AI features are informational only. They
                are not legal, medical, financial, tax, engineering, or
                safety-critical advice. You are solely responsible for
                reviewing, verifying, and validating AI output before
                acting on it.
              </Text>
              <Text variant="body">
                Liability Cap. Total aggregate liability arising from AI
                output or AI-feature operation is capped per the Terms of
                Service at the greater of (a) fees paid in the twelve (12)
                months preceding the claim or (b) one hundred U.S. dollars
                ($100), subject to the lower $50 cap during any beta or
                early access phase per the Beta Disclaimer.
              </Text>
              <Text variant="body">
                No Consequential Damages. Crontech is not liable for lost
                profits, lost revenue, lost data, lost goodwill, business
                interruption, or any indirect, incidental, special,
                consequential, exemplary, or punitive damages arising
                from AI output or AI-feature failures, even if advised of
                the possibility.
              </Text>
              <Text variant="body">
                AS-IS / AS-AVAILABLE. All AI features &mdash; client-side,
                edge, cloud, and any combination thereof &mdash; are
                provided AS-IS and AS-AVAILABLE without warranties of any
                kind, express, implied, or statutory, including
                merchantability, fitness for a particular purpose,
                non-infringement, accuracy, or uninterrupted operation.
              </Text>
              <Text variant="body">
                Customer Indemnification. You agree to indemnify, defend,
                and hold harmless Crontech for any claim arising from (a)
                your use of AI features; (b) AI output you publish,
                distribute, or rely on; (c) third-party intellectual
                property claims relating to AI output; and (d) your
                violation of the Terms of Service or applicable law.
                Crontech does not indemnify for intellectual property
                claims arising from AI-generated output.
              </Text>
              <Text variant="body">
                Unilateral Suspension and Termination. Crontech reserves
                the right to suspend or terminate access to AI features,
                unilaterally, for any reason or no reason, with notice
                where reasonably practicable, including for suspected
                abuse, safety incidents, or third-party model-provider
                changes.
              </Text>
              <Text variant="body">
                Reverse Engineering Prohibited. You may not reverse
                engineer, decompile, disassemble, or otherwise attempt to
                derive the model weights, safety filters, routing logic,
                or internal architecture of the AI systems, except where
                such prohibition is unenforceable under applicable law.
                You may not use AI features or their output to train or
                develop competing AI models without express written
                consent (see AUP Section 3.4).
              </Text>
              <Text variant="body">
                Force Majeure. Force majeure events (including third-party
                AI model provider outages, changes to model availability,
                and changes to model licensing terms imposed by upstream
                providers) are excluded from Crontech's liability.
              </Text>
              <Text variant="body">
                Severability and Entire Agreement. If any provision of
                this page is unenforceable, the remainder remains in full
                force. This page, together with the Terms of Service and
                incorporated policies, constitutes the entire agreement
                with respect to AI transparency and AI-feature usage.
              </Text>
              <Text variant="body">
                Binding Individual Arbitration and Class-Action Waiver.
                Disputes relating to AI features or AI output are subject
                to the binding individual arbitration clause and
                class-action waiver in the Terms of Service (AAA or JAMS),
                including the 30-day opt-out and small-claims carve-out.
              </Text>
              <Text variant="body">
                Governing Law: New Zealand. We intend that this AI
                disclosure be governed by the laws of New Zealand, subject
                to mandatory local law and to the US-specific carve-outs
                advised by counsel. Counsel to confirm against EU AI Act
                obligations that are non-waivable.
              </Text>
              <Text variant="body">
                Export Controls / US Sanctions. Access to and use of AI
                features is subject to the export-controls and
                US-sanctions representation in the Terms of Service. AI
                features may be further restricted in jurisdictions where
                upstream model providers' licensing terms prohibit
                availability.
              </Text>
              <Text variant="body">
                Age Requirement: 18+. You must be at least eighteen (18)
                years of age to use AI features.
              </Text>
              <Text variant="body">
                30-Day Notice for Terms Changes. We intend to provide at
                least thirty (30) days' notice for any material change to
                this AI disclosure or to the AI feature set. Changes
                driven by upstream model-provider actions beyond our
                reasonable control may take effect sooner; we will
                disclose as promptly as practicable.
              </Text>
            </Stack>
          </Card>
        </Stack>

        <Separator />

        {/* ---- 9. Contact ---- */}
        <Card padding="lg">
          <Stack direction="vertical" gap="sm">
            <Text variant="h2" weight="bold">
              Contact
            </Text>
            <Text variant="body">
              For questions specifically about AI usage, data handling, model
              transparency, or anything covered on this page, reach us at:
            </Text>
            <Text variant="h4" weight="semibold">
              ai@crontech.dev
            </Text>
            <Text variant="body" class="text-muted">
              We commit to responding within 5 business days. If your question
              reveals a gap in this disclosure, we will update this page and
              notify you.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
