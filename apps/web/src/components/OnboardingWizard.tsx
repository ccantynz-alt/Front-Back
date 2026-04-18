import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

// ── Storage ──────────────────────────────────────────────────────────

const ONBOARDING_KEY = "btf_onboarding_complete";
const PREFERENCES_KEY = "btf_onboarding_preferences";

export interface OnboardingPreferences {
  buildGoal: "webapp" | "api" | "ai";
  experience: "typescript" | "python" | "byof";
  firstAction: "create" | "explore" | "docs";
}

function getOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return true;
  }
}

function setOnboardingComplete(prefs: OnboardingPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_KEY, "true");
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable
  }
}

export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ONBOARDING_KEY);
    localStorage.removeItem(PREFERENCES_KEY);
  } catch {
    // Storage unavailable
  }
}

export function getOnboardingPreferences(): OnboardingPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as OnboardingPreferences;
  } catch {
    return null;
  }
}

// ── Option Button ────────────────────────────────────────────────────

interface OptionButtonProps {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function OptionButton(props: OptionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={`onboarding-option ${props.selected ? "onboarding-option-selected" : ""}`}
      onClick={props.onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "16px",
        "text-align": "left",
        border: props.selected ? "2px solid var(--color-primary)" : "2px solid var(--color-border)",
        "border-radius": "8px",
        background: props.selected ? "var(--primary-bg, rgba(99, 102, 241, 0.1))" : "var(--color-bg-elevated)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <Text variant="body" weight="semibold">{props.label}</Text>
      <Text variant="caption" class="text-muted">{props.description}</Text>
    </button>
  );
}

// ── Step Indicator ───────────────────────────────────────────────────

function StepIndicator(props: { current: number; total: number }): JSX.Element {
  return (
    <Stack direction="horizontal" gap="xs" align="center">
      {Array.from({ length: props.total }, (_, i) => (
        <div
          style={{
            width: "8px",
            height: "8px",
            "border-radius": "50%",
            background: i === props.current
              ? "var(--color-primary)"
              : "var(--color-border)",
            transition: "background 0.2s ease",
          }}
        />
      ))}
    </Stack>
  );
}

// ── OnboardingWizard ─────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export function OnboardingWizard(props: OnboardingWizardProps): JSX.Element {
  const navigate = useNavigate();

  const [visible, setVisible] = createSignal(!getOnboardingComplete());
  const [step, setStep] = createSignal(0);
  const [animating, setAnimating] = createSignal(false);

  const [buildGoal, setBuildGoal] = createSignal<OnboardingPreferences["buildGoal"] | null>(null);
  const [stackPref, setStackPref] = createSignal<OnboardingPreferences["experience"] | null>(null);
  const [firstAction, setFirstAction] = createSignal<OnboardingPreferences["firstAction"] | null>(null);

  const canProceed = (): boolean => {
    const s = step();
    if (s === 0) return buildGoal() !== null;
    if (s === 1) return stackPref() !== null;
    if (s === 2) return firstAction() !== null;
    return false;
  };

  const goNext = (): void => {
    if (!canProceed()) return;
    setAnimating(true);
    setTimeout(() => {
      if (step() < 2) {
        setStep(step() + 1);
      } else {
        handleComplete();
      }
      setAnimating(false);
    }, 150);
  };

  const goBack = (): void => {
    if (step() === 0) return;
    setAnimating(true);
    setTimeout(() => {
      setStep(step() - 1);
      setAnimating(false);
    }, 150);
  };

  const handleDismiss = (): void => {
    setVisible(false);
    const prefs: OnboardingPreferences = {
      buildGoal: buildGoal() ?? "webapp",
      experience: stackPref() ?? "typescript",
      firstAction: firstAction() ?? "explore",
    };
    setOnboardingComplete(prefs);
    props.onComplete?.();
  };

  const handleComplete = (): void => {
    const prefs: OnboardingPreferences = {
      buildGoal: buildGoal()!,
      experience: stackPref()!,
      firstAction: firstAction()!,
    };
    setOnboardingComplete(prefs);
    setVisible(false);
    props.onComplete?.();

    // Navigate based on chosen first action
    const action = firstAction();
    if (action === "create") {
      navigate("/projects/new");
    } else if (action === "docs") {
      navigate("/docs");
    }
    // "explore" stays on dashboard
  };

  return (
    <Show when={visible()}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": "1000",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          background: "rgba(0, 0, 0, 0.5)",
          "backdrop-filter": "blur(4px)",
        }}
      >
        <Card
          padding="lg"
          class="onboarding-card"
          style={{
            width: "100%",
            "max-width": "480px",
            margin: "16px",
            opacity: animating() ? "0.5" : "1",
            transition: "opacity 0.15s ease",
          }}
        >
          <Stack direction="vertical" gap="lg">
            {/* Header */}
            <Stack direction="horizontal" align="center" class="onboarding-header">
              <Stack direction="vertical" gap="xs" style={{ flex: "1" }}>
                <Text variant="h3" weight="bold">Welcome to Crontech</Text>
                <Text variant="caption" class="text-muted">
                  Set up your developer environment.
                </Text>
              </Stack>
              <button
                type="button"
                onClick={handleDismiss}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "18px",
                  color: "var(--color-text-muted)",
                  padding: "4px",
                }}
                aria-label="Dismiss onboarding"
              >
                x
              </button>
            </Stack>

            {/* Step Indicator */}
            <Stack direction="horizontal" align="center" gap="sm">
              <StepIndicator current={step()} total={3} />
              <Text variant="caption" class="text-muted">
                Step {step() + 1} of 3
              </Text>
            </Stack>

            {/* Step 1: Build Goal */}
            <Show when={step() === 0}>
              <Stack direction="vertical" gap="md">
                <Text variant="h4" weight="semibold">What are you building?</Text>
                <OptionButton
                  label="Web App"
                  description="Full-stack web application with API, database, and auth."
                  selected={buildGoal() === "webapp"}
                  onClick={() => setBuildGoal("webapp")}
                />
                <OptionButton
                  label="API Service"
                  description="Backend API with edge compute, database, and real-time."
                  selected={buildGoal() === "api"}
                  onClick={() => setBuildGoal("api")}
                />
                <OptionButton
                  label="AI Project"
                  description="AI-powered application with three-tier compute routing."
                  selected={buildGoal() === "ai"}
                  onClick={() => setBuildGoal("ai")}
                />
              </Stack>
            </Show>

            {/* Step 2: Stack Preferences */}
            <Show when={step() === 1}>
              <Stack direction="vertical" gap="md">
                <Text variant="h4" weight="semibold">Your stack preferences</Text>
                <OptionButton
                  label="TypeScript"
                  description="SolidJS + Hono + tRPC. The default Crontech stack."
                  selected={stackPref() === "typescript"}
                  onClick={() => setStackPref("typescript")}
                />
                <OptionButton
                  label="Python"
                  description="Python backend with TypeScript frontend. AI/ML workloads."
                  selected={stackPref() === "python"}
                  onClick={() => setStackPref("python")}
                />
                <OptionButton
                  label="Bring your own"
                  description="Connect an existing repo. Any framework."
                  selected={stackPref() === "byof"}
                  onClick={() => setStackPref("byof")}
                />
              </Stack>
            </Show>

            {/* Step 3: Get Started */}
            <Show when={step() === 2}>
              <Stack direction="vertical" gap="md">
                <Text variant="h4" weight="semibold">Get started</Text>
                <OptionButton
                  label="Create a project"
                  description="Set up your first project with a database and deploy target."
                  selected={firstAction() === "create"}
                  onClick={() => setFirstAction("create")}
                />
                <OptionButton
                  label="Explore the dashboard"
                  description="Browse the platform and discover features."
                  selected={firstAction() === "explore"}
                  onClick={() => setFirstAction("explore")}
                />
                <OptionButton
                  label="Read the docs"
                  description="Learn the platform before building."
                  selected={firstAction() === "docs"}
                  onClick={() => setFirstAction("docs")}
                />
              </Stack>
            </Show>

            {/* Navigation Buttons */}
            <Stack direction="horizontal" gap="sm" align="center">
              <Show when={step() > 0}>
                <Button variant="outline" size="sm" onClick={goBack}>
                  Back
                </Button>
              </Show>
              <div style={{ flex: "1" }} />
              <Button
                variant="primary"
                size="sm"
                onClick={goNext}
                disabled={!canProceed()}
              >
                {step() === 2 ? "Get Started" : "Next"}
              </Button>
            </Stack>
          </Stack>
        </Card>
      </div>
    </Show>
  );
}
