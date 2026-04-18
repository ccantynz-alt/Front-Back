import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

// ── Storage ──────────────────────────────────────────────────────────

const ONBOARDING_KEY = "btf_onboarding_complete";
const PREFERENCES_KEY = "btf_onboarding_preferences";

export interface OnboardingPreferences {
  buildGoal: "website" | "video" | "both";
  experience: "beginner" | "intermediate" | "expert";
  firstAction: "builder" | "video" | "explore";
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
  const [experience, setExperience] = createSignal<OnboardingPreferences["experience"] | null>(null);
  const [firstAction, setFirstAction] = createSignal<OnboardingPreferences["firstAction"] | null>(null);

  const canProceed = (): boolean => {
    const s = step();
    if (s === 0) return buildGoal() !== null;
    if (s === 1) return experience() !== null;
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
      buildGoal: buildGoal() ?? "both",
      experience: experience() ?? "beginner",
      firstAction: firstAction() ?? "explore",
    };
    setOnboardingComplete(prefs);
    props.onComplete?.();
  };

  const handleComplete = (): void => {
    const prefs: OnboardingPreferences = {
      buildGoal: buildGoal()!,
      experience: experience()!,
      firstAction: firstAction()!,
    };
    setOnboardingComplete(prefs);
    setVisible(false);
    props.onComplete?.();

    // Navigate based on chosen first action
    const action = firstAction();
    if (action === "builder") {
      navigate("/builder");
    } else if (action === "video") {
      navigate("/builder");
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
                  Let us personalize your experience.
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
                <Text variant="h4" weight="semibold">What do you want to build?</Text>
                <OptionButton
                  label="Websites"
                  description="Use the AI website builder to create stunning sites."
                  selected={buildGoal() === "website"}
                  onClick={() => setBuildGoal("website")}
                />
                <OptionButton
                  label="Videos"
                  description="WebGPU-accelerated video editing in the browser."
                  selected={buildGoal() === "video"}
                  onClick={() => setBuildGoal("video")}
                />
                <OptionButton
                  label="Both"
                  description="Full access to website builder and video editor."
                  selected={buildGoal() === "both"}
                  onClick={() => setBuildGoal("both")}
                />
              </Stack>
            </Show>

            {/* Step 2: Experience Level */}
            <Show when={step() === 1}>
              <Stack direction="vertical" gap="md">
                <Text variant="h4" weight="semibold">What is your experience level?</Text>
                <OptionButton
                  label="Beginner"
                  description="New to building websites or editing video."
                  selected={experience() === "beginner"}
                  onClick={() => setExperience("beginner")}
                />
                <OptionButton
                  label="Intermediate"
                  description="Some experience with web development or video tools."
                  selected={experience() === "intermediate"}
                  onClick={() => setExperience("intermediate")}
                />
                <OptionButton
                  label="Expert"
                  description="Professional developer or video editor."
                  selected={experience() === "expert"}
                  onClick={() => setExperience("expert")}
                />
              </Stack>
            </Show>

            {/* Step 3: First Action */}
            <Show when={step() === 2}>
              <Stack direction="vertical" gap="md">
                <Text variant="h4" weight="semibold">Choose your first action</Text>
                <OptionButton
                  label="Open Composer"
                  description="Generate SolidJS component trees from a prompt using the three-tier compute router."
                  selected={firstAction() === "builder"}
                  onClick={() => setFirstAction("builder")}
                />
                <OptionButton
                  label="Open Video Editor"
                  description="Jump into the WebGPU-powered video editor."
                  selected={firstAction() === "video"}
                  onClick={() => setFirstAction("video")}
                />
                <OptionButton
                  label="Explore the Platform"
                  description="Browse the dashboard and discover features."
                  selected={firstAction() === "explore"}
                  onClick={() => setFirstAction("explore")}
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
