import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal, createMemo, onMount } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { useAuth } from "../stores";

type Mode = "choose" | "guest" | "email-passkey" | "email-password" | "creating";

interface PasswordStrengthInfo {
  score: number;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrengthInfo {
  if (!password) return { score: 0, label: "", color: "var(--color-bg-muted)" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const finalScore = Math.min(score, 4);

  const labels: Record<number, string> = {
    0: "Very weak",
    1: "Weak",
    2: "Fair",
    3: "Strong",
    4: "Very strong",
  };

  const colors: Record<number, string> = {
    0: "var(--color-danger)",
    1: "var(--color-warning)",
    2: "var(--color-warning)",
    3: "var(--color-success)",
    4: "var(--color-primary)",
  };

  return {
    score: finalScore,
    label: labels[finalScore] ?? "Very weak",
    color: colors[finalScore] ?? "var(--color-danger)",
  };
}

function validatePasswordRequirements(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("At least 8 characters");
  if (!/[0-9]/.test(password)) issues.push("At least one number");
  if (!/[^a-zA-Z0-9]/.test(password)) issues.push("At least one special character");
  return issues;
}

export default function RegisterPage(): ReturnType<typeof Stack> {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<Mode>("choose");
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [localError, setLocalError] = createSignal<string | null>(null);

  // Handle OAuth callback tokens on mount
  onMount(() => {
    auth.handleOAuthCallback();
  });

  const passwordStrength = createMemo((): PasswordStrengthInfo =>
    getPasswordStrength(password()),
  );

  const passwordIssues = createMemo((): string[] =>
    validatePasswordRequirements(password()),
  );

  const passwordsMatch = createMemo((): boolean => {
    if (!confirmPassword()) return true;
    return password() === confirmPassword();
  });

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

  const startEmailPasskey = async (): Promise<void> => {
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
      setLocalError("We couldn't sign you up just now. Try a different method.");
      setMode("email-passkey");
    }
  };

  const startEmailPassword = async (): Promise<void> => {
    setLocalError(null);
    const e = email().trim();
    const n = name().trim() || "Friend";
    const p = password();
    const cp = confirmPassword();

    if (!e) {
      setLocalError("Please enter your email address.");
      return;
    }
    if (!n) {
      setLocalError("Please enter your name.");
      return;
    }

    // Validate password requirements
    const issues = validatePasswordRequirements(p);
    if (issues.length > 0) {
      setLocalError(`Password requirements: ${issues.join(", ")}`);
      return;
    }

    if (p !== cp) {
      setLocalError("Passwords do not match.");
      return;
    }

    setMode("creating");
    setProgress(30);
    try {
      await auth.registerWithPassword(e, p, n);
      setProgress(100);
      navigate("/dashboard?tour=1", { replace: true });
    } catch {
      setLocalError("Registration failed. Please try again.");
      setMode("email-password");
    }
  };

  const handleGoogleSignUp = async (): Promise<void> => {
    setLocalError(null);
    try {
      await auth.loginWithGoogle("/dashboard?tour=1");
    } catch {
      // Error is set in auth store
    }
  };

  const displayError = (): string | null => localError() ?? auth.error();

  return (
    <Stack direction="vertical" align="center" justify="center" class="page-center">
      <Title>Get Started - Crontech</Title>
      <Card class="auth-card" padding="lg">
        <Stack direction="vertical" gap="lg" align="center">
          <Text variant="h2" weight="bold" align="center">
            Let's get you started
          </Text>
          <Text variant="body" align="center" class="text-muted">
            Create your account in seconds.
          </Text>

          <Show when={displayError()}>
            <div class="alert alert-error">
              <Text variant="body">{displayError()}</Text>
            </div>
          </Show>

          {/* Choose Mode */}
          <Show when={mode() === "choose"}>
            <Stack direction="vertical" gap="md" class="auth-form">
              {/* Google OAuth */}
              <Button
                variant="secondary"
                size="lg"
                onClick={handleGoogleSignUp}
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
                  <span>Sign up with Google</span>
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

              <Button variant="primary" size="lg" onClick={startGuest}>
                Try for Free (one click)
              </Button>
              <Text variant="caption" align="center" class="text-muted">
                Instant demo account, sample projects pre-loaded.
              </Text>

              <Button
                variant="secondary"
                size="lg"
                onClick={() => setMode("email-password")}
              >
                Continue with Email
              </Button>

              <Button
                variant="ghost"
                size="md"
                onClick={() => setMode("email-passkey")}
              >
                Use a Passkey instead
              </Button>
            </Stack>
          </Show>

          {/* Email + Password Registration */}
          <Show when={mode() === "email-password"}>
            <Stack direction="vertical" gap="md" class="auth-form">
              <Input
                label="Your name"
                type="text"
                placeholder="What should we call you?"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
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

              <div style={{ position: "relative" }}>
                <Input
                  label="Password"
                  type={showPassword() ? "text" : "password"}
                  placeholder="Create a strong password"
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

              {/* Password Strength Indicator */}
              <Show when={password().length > 0}>
                <div style={{ width: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      "margin-bottom": "6px",
                    }}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        style={{
                          flex: "1",
                          height: "4px",
                          "border-radius": "2px",
                          background:
                            i < passwordStrength().score
                              ? passwordStrength().color
                              : "var(--color-bg-muted)",
                          transition: "background 0.2s ease",
                        }}
                      />
                    ))}
                  </div>
                  <Text
                    variant="caption"
                    style={{ color: passwordStrength().color }}
                  >
                    {passwordStrength().label}
                  </Text>

                  {/* Requirements checklist */}
                  <Show when={passwordIssues().length > 0}>
                    <div style={{ "margin-top": "4px" }}>
                      {passwordIssues().map((issue) => (
                        <Text
                          variant="caption"
                          class="text-muted"
                          style={{ display: "block", "font-size": "12px" }}
                        >
                          {issue}
                        </Text>
                      ))}
                    </div>
                  </Show>
                </div>
              </Show>

              <Input
                label="Confirm password"
                type={showPassword() ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword()}
                onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                disabled={auth.isLoading()}
              />

              <Show when={!passwordsMatch() && confirmPassword().length > 0}>
                <Text variant="caption" style={{ color: "var(--color-danger)" }}>
                  Passwords do not match
                </Text>
              </Show>

              <Button
                variant="primary"
                size="lg"
                onClick={startEmailPassword}
                loading={auth.isLoading()}
              >
                Create my account
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setMode("choose")}
              >
                Back
              </Button>
            </Stack>
          </Show>

          {/* Email + Passkey Registration */}
          <Show when={mode() === "email-passkey"}>
            <Stack direction="vertical" gap="md" class="auth-form">
              <Input
                label="Your name"
                type="text"
                placeholder="What should we call you?"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                disabled={auth.isLoading()}
              />
              <Input
                label="Your email"
                type="email"
                placeholder="you@example.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                disabled={auth.isLoading()}
              />
              <Button
                variant="primary"
                size="lg"
                onClick={startEmailPasskey}
                loading={auth.isLoading()}
              >
                Create account with Passkey
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setMode("choose")}
              >
                Back
              </Button>
              <Text variant="caption" align="center" class="text-muted">
                Passkeys are the safest way to sign in -- no passwords to remember.
              </Text>
            </Stack>
          </Show>

          {/* Creating Account Progress */}
          <Show when={mode() === "creating"}>
            <Stack direction="vertical" gap="md" align="center">
              <Text variant="body">Setting up your account...</Text>
              <div
                style={{
                  width: "240px",
                  height: "8px",
                  background: "var(--color-bg-muted)",
                  "border-radius": "9999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress()}%`,
                    height: "100%",
                    background: "var(--color-primary)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <Text variant="caption" class="text-muted">
                Loading sample projects and starting your tour...
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
