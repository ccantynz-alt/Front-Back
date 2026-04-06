import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { Badge, Button, Card, Input, Select, Stack, Text } from "@back-to-the-future/ui";
import {
  TEMPLATES,
  getFeaturedTemplates,
  searchTemplates,
  type Template,
  type TemplateCategory,
  type TemplateDifficulty,
} from "@back-to-the-future/schemas";

// ── Templates Gallery Page ─────────────────────────────────────────
// One-click starter templates so novices can go from zero to a real
// project in two minutes. Plain English. No technical jargon.

const CATEGORIES: { value: string; label: string }[] = [
  { value: "all", label: "All Categories" },
  { value: "landing", label: "Landing Pages" },
  { value: "portfolio", label: "Portfolios" },
  { value: "ecommerce", label: "Online Stores" },
  { value: "blog", label: "Blogs" },
  { value: "saas", label: "SaaS" },
  { value: "app", label: "Apps & Forms" },
];

const DIFFICULTIES: { value: string; label: string }[] = [
  { value: "all", label: "Any Skill Level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

interface TemplateCardProps {
  template: Template;
  onUse: (id: string) => void;
  onCustomize: (id: string) => void;
}

function TemplateCard(props: TemplateCardProps): ReturnType<typeof Card> {
  const [hovered, setHovered] = createSignal(false);
  return (
    <Card padding="md">
      <Stack direction="vertical" gap="sm" align="stretch" justify="start">
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            height: "140px",
            background: hovered()
              ? "linear-gradient(135deg, #6366f1, #ec4899)"
              : "linear-gradient(135deg, #e0e7ff, #fce7f3)",
            "border-radius": "8px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            transition: "background 0.2s",
          }}
        >
          <Text variant="h3" weight="bold" align="center">
            {props.template.name}
          </Text>
        </div>
        <Text variant="h4" weight="semibold">
          {props.template.name}
        </Text>
        <Text variant="caption">{props.template.description}</Text>
        <Stack direction="horizontal" gap="xs" align="center" justify="start">
          <Badge variant="info" size="sm">{props.template.category}</Badge>
          <Badge variant="default" size="sm">{props.template.difficulty}</Badge>
          <Badge variant="success" size="sm">{props.template.estimatedTime}</Badge>
        </Stack>
        <Stack direction="horizontal" gap="sm" align="center" justify="start">
          <Button
            variant="primary"
            size="sm"
            onClick={() => props.onUse(props.template.id)}
          >
            Use This Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => props.onCustomize(props.template.id)}
          >
            Customize with AI
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");
  const [category, setCategory] = createSignal<string>("all");
  const [difficulty, setDifficulty] = createSignal<string>("all");

  const featured = getFeaturedTemplates();

  const filtered = createMemo(() => {
    let list: Template[] = search().trim() ? searchTemplates(search()) : TEMPLATES;
    if (category() !== "all") {
      list = list.filter((t) => t.category === (category() as TemplateCategory));
    }
    if (difficulty() !== "all") {
      list = list.filter((t) => t.difficulty === (difficulty() as TemplateDifficulty));
    }
    return list;
  });

  const useTemplate = (id: string): void => {
    navigate(`/builder?template=${id}`);
  };

  const customizeWithAI = (id: string): void => {
    navigate(`/builder?template=${id}&ai=true`);
  };

  return (
    <>
      <Title>Templates Gallery — Marco Reid</Title>
      <Stack direction="vertical" gap="lg" align="stretch" justify="start">
        <Stack direction="vertical" gap="sm" align="center" justify="start">
          <Text variant="h1" weight="bold" align="center">
            Pick a Template. Ship in Minutes.
          </Text>
          <Text variant="body" align="center">
            Start from a real, production-ready design. Customize anything. Or let AI do it for you.
          </Text>
        </Stack>

        <Card padding="md">
          <Stack direction="vertical" gap="md" align="stretch" justify="start">
            <Text variant="h3" weight="semibold">
              Featured Templates
            </Text>
            <div
              style={{
                display: "grid",
                "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              <For each={featured}>
                {(t) => (
                  <TemplateCard template={t} onUse={useTemplate} onCustomize={customizeWithAI} />
                )}
              </For>
            </div>
          </Stack>
        </Card>

        <Card padding="md">
          <Stack direction="vertical" gap="md" align="stretch" justify="start">
            <Text variant="h3" weight="semibold">
              Browse All Templates
            </Text>
            <Stack direction="horizontal" gap="md" align="center" justify="start">
              <Input
                name="search"
                type="search"
                placeholder="Search templates..."
                value={search()}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              />
              <Select
                name="category"
                options={CATEGORIES}
                value={category()}
                onChange={(v) => setCategory(v)}
              />
              <Select
                name="difficulty"
                options={DIFFICULTIES}
                value={difficulty()}
                onChange={(v) => setDifficulty(v)}
              />
            </Stack>
            <Show
              when={filtered().length > 0}
              fallback={
                <Text variant="body" align="center">
                  No templates match your filters. Try clearing them.
                </Text>
              }
            >
              <div
                style={{
                  display: "grid",
                  "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "16px",
                }}
              >
                <For each={filtered()}>
                  {(t) => (
                    <TemplateCard template={t} onUse={useTemplate} onCustomize={customizeWithAI} />
                  )}
                </For>
              </div>
            </Show>
          </Stack>
        </Card>

        <Stack direction="horizontal" gap="md" align="center" justify="center">
          <A href="/dashboard">
            <Button variant="ghost" size="md">Back to Dashboard</Button>
          </A>
        </Stack>
      </Stack>
    </>
  );
}
