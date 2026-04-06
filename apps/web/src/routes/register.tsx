import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

type Mode = "choose" | "guest" | "email" | "creating";

export default function RegisterPage(): ReturnType<typeof Stack> {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<Mode>("choose");
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [progress, setProgress] = createSignal(0);
  const [localError, setLocalError] = createSignal<string | null>(null);

  const startGuest = async (): Promise<void> => {
    setLocalError(null);
    setMode("creating");
    setProgress(20);
    const guestEmail = `guest-${Date.now()}@demo.local`;
    const guestName = "Guest Explorer";
    setProgress(50);
    try {
      try {
        await auth.register(guestEmail, guestName);
      } catch {
        // Demo mode: ignore auth errors and continue.
      }
      setProgress(90);
      window.setTimeout(() => {
        setProgress(100);
        navigate("/dashboard?tour=1", { replace: true });
      }, 300);
    } catch {
      setLocalError("Something went wrong. Try again — it usually works the second time.");
      setMode("choose");
    }
  };

  const startEmail = async (): Promise<void> => {
    setLocalError(null);
    const e = email().trim();
    const n = name().trim() || "Friend";
    if (!e) {
      setLocalError("Please add your email so we can save your work.");
      return;
    }
    setMode("creating");
    setProgress(30);
    try {
      await auth.register(e, n);
      setProgress(100);
      navigate("/dashboard?tour=1", { replace: true });
    } catch {
      setLocalError("We couldn't sign you up just now. Try 'Continue as Guest' instead.");
      setMode("email");
    }
  };

  const displayError = (): string | null => localError() ?? auth.error();

  return (
    <Stack direction="vertical" align="center" justify="center" class="page-center">
      <Title>Get Started - Marco Reid</Title>
      <Card class="auth-card" padding="lg">
        <Stack direction="vertical" gap="lg" align="center">
          <Text variant="h2" weight="bold" align="center">
            Let's get you started
          </Text>
          <Text variant="body" align="center" class="text-muted">
            No forms. No fuss. Pick how you want to begin.
          </Text>

          <Show when={displayError()}>
            <div class="alert alert-error">
              <Text variant="body">{displayError()}</Text>
            </div>
          </Show>

          <Show when={mode() === "choose"}>
            <Stack direction="vertical" gap="md" class="auth-form">
              <Button variant="primary" size="lg" onClick={startGuest}>
                Try for Free (one click)
              </Button>
              <Text variant="caption" align="center" class="text-muted">
                Instant demo account, sample projects pre-loaded.
              </Text>
              <Button variant="secondary" size="lg" onClick={() => setMode("email")}>
                Continue with Email
              </Button>
              <Text variant="caption" align="center" class="text-muted">
                Save your work across devices.
              </Text>
            </Stack>
          </Show>

          <Show when={mode() === "email"}>
            <Stack direction="vertical" gap="md" class="auth-form">
              <Input
                label="Your name"
                type="text"
                placeholder="What should we call you?"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
              <Input
                label="Your email"
                type="email"
                placeholder="you@example.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
              <Button variant="primary" size="lg" onClick={startEmail}>
                Create my account
              </Button>
              <Button variant="ghost" size="md" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Text variant="caption" align="center" class="text-muted">
                We use safe sign-in — no passwords to remember.
              </Text>
            </Stack>
          </Show>

          <Show when={mode() === "creating"}>
            <Stack direction="vertical" gap="md" align="center">
              <Text variant="body">Setting up your account…</Text>
              <div
                style={{
                  width: "240px",
                  height: "8px",
                  background: "#e5e7eb",
                  "border-radius": "9999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress()}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <Text variant="caption" class="text-muted">
                Loading sample projects and starting your tour…
              </Text>
            </Stack>
          </Show>

          <Text variant="caption" class="text-muted">
            Already have an account?{" "}
            <A href="/login" class="link">
              Sign in
            </A>
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
