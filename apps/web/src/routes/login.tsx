import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

export default function LoginPage(): ReturnType<typeof Stack> {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [localError, setLocalError] = createSignal<string | null>(null);

  const handlePasskeyLogin = async (): Promise<void> => {
    setLocalError(null);
    const emailValue = email().trim();
    if (!emailValue) {
      setLocalError("Please enter your email address.");
      return;
    }
    try {
      await auth.login(emailValue);
      navigate("/dashboard", { replace: true });
    } catch {
      // Error is set in auth store
    }
  };

  const displayError = (): string | null => localError() ?? auth.error();

  return (
    <Stack direction="vertical" align="center" justify="center" class="page-center">
      <Title>Sign In - Back to the Future</Title>
      <Card class="auth-card" padding="lg">
        <Stack direction="vertical" gap="lg" align="center">
          <Text variant="h2" weight="bold" align="center">
            Sign In
          </Text>
          <Text variant="body" align="center" class="text-muted">
            Use your passkey to sign in securely.
          </Text>

          <Show when={displayError()}>
            <div class="alert alert-error">
              <Text variant="body">{displayError()}</Text>
            </div>
          </Show>

          <Stack direction="vertical" gap="md" class="auth-form">
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
              onClick={handlePasskeyLogin}
              loading={auth.isLoading()}
              class="auth-submit"
            >
              Sign in with Passkey
            </Button>
          </Stack>

          <Text variant="caption" class="text-muted">
            Don't have an account?{" "}
            <A href="/register" class="link">Create one</A>
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
