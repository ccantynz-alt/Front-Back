import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

export default function RegisterPage(): ReturnType<typeof Stack> {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [localError, setLocalError] = createSignal<string | null>(null);

  const handleRegister = async (): Promise<void> => {
    setLocalError(null);

    const emailValue = email().trim();
    const nameValue = displayName().trim();

    if (!emailValue) {
      setLocalError("Please enter your email address.");
      return;
    }
    if (!nameValue) {
      setLocalError("Please enter your display name.");
      return;
    }

    try {
      await auth.register(emailValue, nameValue);
      navigate("/dashboard", { replace: true });
    } catch {
      // Error is set in auth store
    }
  };

  const displayError = (): string | null => localError() ?? auth.error();

  return (
    <Stack direction="vertical" align="center" justify="center" class="page-center">
      <Title>Register - Back to the Future</Title>
      <Card class="auth-card" padding="lg">
        <Stack direction="vertical" gap="lg" align="center">
          <Text variant="h2" weight="bold" align="center">
            Create Account
          </Text>
          <Text variant="body" align="center" class="text-muted">
            Register with a passkey for phishing-immune authentication.
          </Text>

          <Show when={displayError()}>
            <div class="alert alert-error">
              <Text variant="body">{displayError()}</Text>
            </div>
          </Show>

          <Stack direction="vertical" gap="md" class="auth-form">
            <Input
              label="Display Name"
              type="text"
              placeholder="Your Name"
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
              disabled={auth.isLoading()}
            />

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              disabled={auth.isLoading()}
            />

            <Button
              variant="primary"
              size="lg"
              onClick={handleRegister}
              loading={auth.isLoading()}
              class="auth-submit"
            >
              Register with Passkey
            </Button>
          </Stack>

          <Text variant="caption" class="text-muted">
            Already have an account?{" "}
            <A href="/login" class="link">Sign in</A>
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
