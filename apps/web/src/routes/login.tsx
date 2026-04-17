import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal, onMount } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

type AuthMethod = "choose" | "passkey" | "password";

export default function LoginPage(): ReturnType<typeof Stack> {
  const auth = useAuth();
  const navigate = useNavigate();
  const [method, setMethod] = createSignal<AuthMethod>("choose");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [localError, setLocalError] = createSignal<string | null>(null);

  // Handle OAuth callback tokens on mount
  onMount(() => {
    auth.handleOAuthCallback();
  });

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

  const handlePasswordLogin = async (): Promise<void> => {
    setLocalError(null);
    const emailValue = email().trim();
    const passwordValue = password();
    if (!emailValue) {
      setLocalError("Please enter your email address.");
      return;
    }
    if (!passwordValue) {
      setLocalError("Please enter your password.");
      return;
    }
    try {
      await auth.loginWithPassword(emailValue, passwordValue);
      navigate("/dashboard", { replace: true });
    } catch {
      // Error is set in auth store
    }
  };

  const handleGoogleLogin = async (): Promise<void> => {
    setLocalError(null);
    try {
      await auth.loginWithGoogle("/dashboard");
    } catch {
      // Error is set in auth store
    }
  };

  const displayError = (): string | null => localError() ?? auth.error();

  return (
    <Stack direction="vertical" align="center" justify="center" class="page-center">
      <Title>Sign In - Crontech</Title>
      <Card class="auth-card" padding="lg">
        <Stack direction="vertical" gap="lg" align="center">
          <Text variant="h2" weight="bold" align="center">
            Welcome back
          </Text>
          <Text variant="body" align="center" class="text-muted">
            Sign in to your Crontech account
          </Text>

          <Show when={displayError()}>
            <div class="alert alert-error">
              <Text variant="body">{displayError()}</Text>
            </div>
          </Show>

          {/* Google OAuth Button -- always visible at top */}
          <Stack direction="vertical" gap="md" class="auth-form">
            <Button
              variant="secondary"
              size="lg"
              onClick={handleGoogleLogin}
              loading={auth.isLoading() && method() === "choose"}
              class="auth-google-btn"
            >
              <Stack direction="horizontal" gap="sm" align="center" justify="center">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                    fill="#4285F4"
                  />
                  <path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                    fill="#34A853"
                  />
                  <path
                    d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Continue with Google</span>
              </Stack>
            </Button>

            {/* Divider */}
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "12px",
                width: "100%",
              }}
            >
              <div
                style={{
                  flex: "1",
                  height: "1px",
                  background: "var(--color-border)",
                }}
              />
              <Text variant="caption" class="text-muted">
                or
              </Text>
              <div
                style={{
                  flex: "1",
                  height: "1px",
                  background: "var(--color-border)",
                }}
              />
            </div>
          </Stack>

          {/* Method Selector */}
          <Show when={method() === "choose"}>
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
                onClick={() => setMethod("password")}
                class="auth-submit"
              >
                Continue with Email
              </Button>

              <Button
                variant="ghost"
                size="md"
                onClick={() => setMethod("passkey")}
              >
                Sign in with Passkey
              </Button>
            </Stack>
          </Show>

          {/* Password Login Form */}
          <Show when={method() === "password"}>
            <Stack direction="vertical" gap="md" class="auth-form">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                disabled={auth.isLoading()}
              />

              <div style={{ position: "relative" }}>
                <Input
                  label="Password"
                  type={showPassword() ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  disabled={auth.isLoading()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword())}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "38px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    "font-size": "13px",
                  }}
                >
                  {showPassword() ? "Hide" : "Show"}
                </button>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={handlePasswordLogin}
                loading={auth.isLoading()}
                class="auth-submit"
              >
                Sign In
              </Button>

              <Button
                variant="ghost"
                size="md"
                onClick={() => setMethod("choose")}
              >
                Back to all options
              </Button>
            </Stack>
          </Show>

          {/* Passkey Login Form */}
          <Show when={method() === "passkey"}>
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

              <Button
                variant="ghost"
                size="md"
                onClick={() => setMethod("choose")}
              >
                Back to all options
              </Button>
            </Stack>
          </Show>

          <Text variant="caption" class="text-muted">
            Don't have an account?{" "}
            <A href="/register" class="link">Create one</A>
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
