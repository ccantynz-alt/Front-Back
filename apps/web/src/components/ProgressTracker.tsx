import { For, createMemo, createSignal, onMount } from "solid-js";
import { Badge, Button, Card, Stack, Text } from "@back-to-the-future/ui";

// ── Progress Tracker ───────────────────────────────────────────────
// Shows the user how far they've come on the platform.
// Checklist + progress bar + motivation messages + badge unlocks.

export interface ProgressStep {
  id: string;
  title: string;
  description: string;
  reward?: string;
}

const STEPS: ProgressStep[] = [
  { id: "create-project", title: "Create your first project", description: "Pick a template or start from scratch.", reward: "Starter Badge" },
  { id: "customize", title: "Customize a component", description: "Make it your own with a tweak or two." },
  { id: "invite-collab", title: "Invite a collaborator", description: "Building is more fun together.", reward: "Team Player Badge" },
  { id: "use-ai", title: "Use the AI assistant", description: "Let AI suggest improvements." },
  { id: "publish", title: "Publish your site", description: "Take it live to the world.", reward: "Launcher Badge" },
  { id: "share", title: "Share with someone", description: "Send the link to a friend or coworker." },
];

const MOTIVATIONS: string[] = [
  "Every expert started with one project. You've got this.",
  "Halfway there! You're moving fast.",
  "So close to launching. One more step.",
  "You're crushing it! You've unlocked the full platform.",
];

const STORAGE_KEY = "btf:progress";

function loadCompleted(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCompleted(set: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function ProgressTracker(): ReturnType<typeof Card> {
  const [completed, setCompleted] = createSignal<Set<string>>(new Set());

  onMount(() => {
    setCompleted(loadCompleted());
  });

  const toggleStep = (id: string): void => {
    const next = new Set(completed());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCompleted(next);
    saveCompleted(next);
  };

  const percent = createMemo<number>(() => {
    return Math.round((completed().size / STEPS.length) * 100);
  });

  const motivation = createMemo<string>(() => {
    const p = percent();
    if (p === 0) return MOTIVATIONS[0] ?? "";
    if (p < 50) return MOTIVATIONS[0] ?? "";
    if (p < 80) return MOTIVATIONS[1] ?? "";
    if (p < 100) return MOTIVATIONS[2] ?? "";
    return MOTIVATIONS[3] ?? "";
  });

  const earnedRewards = createMemo<string[]>(() => {
    return STEPS.filter((s) => s.reward && completed().has(s.id)).map((s) => s.reward as string);
  });

  return (
    <Card title="Your Progress" padding="md">
      <Stack direction="vertical" gap="md" align="stretch" justify="start">
        <Text variant="body">{motivation()}</Text>

        <div
          style={{
            width: "100%",
            height: "12px",
            background: "#e5e7eb",
            "border-radius": "999px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percent()}%`,
              height: "100%",
              background: "linear-gradient(90deg, #6366f1, #ec4899)",
              transition: "width 0.4s ease",
            }}
          />
        </div>

        <Text variant="caption">
          {completed().size} of {STEPS.length} complete ({percent()}%)
        </Text>

        <Stack direction="vertical" gap="sm" align="stretch" justify="start">
          <For each={STEPS}>
            {(step) => {
              const done = (): boolean => completed().has(step.id);
              return (
                <Stack direction="horizontal" gap="sm" align="center" justify="start">
                  <Button
                    variant={done() ? "primary" : "outline"}
                    size="sm"
                    onClick={() => toggleStep(step.id)}
                  >
                    {done() ? "Done" : "Mark Done"}
                  </Button>
                  <Stack direction="vertical" gap="xs" align="stretch" justify="start">
                    <Text variant="body" weight={done() ? "semibold" : "normal"}>
                      {done() ? `✓ ${step.title}` : step.title}
                    </Text>
                    <Text variant="caption">{step.description}</Text>
                  </Stack>
                </Stack>
              );
            }}
          </For>
        </Stack>

        {earnedRewards().length > 0 && (
          <Card padding="sm">
            <Stack direction="vertical" gap="sm" align="stretch" justify="start">
              <Text variant="h4" weight="semibold">Badges Unlocked</Text>
              <Stack direction="horizontal" gap="sm" align="center" justify="start">
                <For each={earnedRewards()}>
                  {(r) => (
                    <Badge variant="success" size="md">
                      {r}
                    </Badge>
                  )}
                </For>
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </Card>
  );
}
