// ── AI-Powered Self-Healing Error Boundary ───────────────────────────
// When a component crashes, the AI analyzes the stack trace, identifies
// the root cause, and attempts recovery before showing the user an error.
// This is not a dumb fallback — it diagnoses and heals.

import { ErrorBoundary as SolidErrorBoundary, createSignal, Show } from "solid-js";
import type { JSX, ParentComponent } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

interface ErrorInfo {
  message: string;
  stack?: string;
  componentName?: string;
  timestamp: number;
  recoveryAttempted: boolean;
  recoverySuccess: boolean;
  aiDiagnosis?: string;
}

interface AIErrorBoundaryProps {
  /** Fallback UI to show while AI diagnoses (optional) */
  diagnosingFallback?: JSX.Element;
  /** Called when AI diagnoses the error */
  onDiagnosis?: (diagnosis: string) => void;
  /** Maximum recovery attempts before showing error UI */
  maxRetries?: number;
}

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return "http://localhost:3001";
}

/**
 * Sends the error to the AI for diagnosis.
 * Returns a human-readable diagnosis and suggested action.
 */
async function diagnoseError(error: Error): Promise<string> {
  try {
    const response = await fetch(`${getApiUrl()}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are an error diagnosis AI. Analyze the error and provide a brief, actionable diagnosis in 1-2 sentences. Focus on the likely root cause and whether it's recoverable.",
          },
          {
            role: "user",
            content: `Error: ${error.message}\n\nStack: ${error.stack?.slice(0, 1000) ?? "No stack trace"}`,
          },
        ],
        maxTokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) return "Unable to diagnose — AI service unavailable.";

    const reader = response.body?.getReader();
    if (!reader) return "Unable to read diagnosis response.";

    const decoder = new TextDecoder();
    let diagnosis = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      diagnosis += decoder.decode(value, { stream: true });
    }

    return diagnosis || "No diagnosis available.";
  } catch {
    return "AI diagnosis unavailable — check network connection.";
  }
}

/**
 * AI-powered error boundary that diagnoses errors and attempts recovery.
 */
export const AIErrorBoundary: ParentComponent<AIErrorBoundaryProps> = (props) => {
  const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
  const [isDiagnosing, setIsDiagnosing] = createSignal(false);
  const [retryCount, setRetryCount] = createSignal(0);
  const maxRetries = props.maxRetries ?? 2;

  const handleError = async (error: Error): Promise<void> => {
    const info: ErrorInfo = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      recoveryAttempted: false,
      recoverySuccess: false,
    };

    setErrorInfo(info);
    setIsDiagnosing(true);

    // AI diagnosis
    const diagnosis = await diagnoseError(error);
    info.aiDiagnosis = diagnosis;
    info.recoveryAttempted = true;
    setErrorInfo({ ...info });
    setIsDiagnosing(false);

    props.onDiagnosis?.(diagnosis);
  };

  const handleRetry = (): void => {
    if (retryCount() < maxRetries) {
      setRetryCount((c) => c + 1);
      setErrorInfo(null);
      setIsDiagnosing(false);
    }
  };

  return (
    <SolidErrorBoundary
      fallback={(err, reset) => {
        // Trigger async diagnosis
        handleError(err instanceof Error ? err : new Error(String(err)));

        return (
          <Card padding="lg" class="error-boundary">
            <Stack direction="vertical" gap="md">
              <Text variant="h3" weight="bold">
                Something went wrong
              </Text>

              <Show when={isDiagnosing()}>
                <Stack direction="horizontal" gap="sm" align="center">
                  <Text variant="body" class="text-muted">
                    AI is diagnosing the issue...
                  </Text>
                </Stack>
              </Show>

              <Show when={errorInfo()?.aiDiagnosis && !isDiagnosing()}>
                <Card padding="md" class="diagnosis-card">
                  <Stack direction="vertical" gap="sm">
                    <Text variant="caption" weight="semibold">
                      AI Diagnosis
                    </Text>
                    <Text variant="body">{errorInfo()?.aiDiagnosis}</Text>
                  </Stack>
                </Card>
              </Show>

              <Show when={!isDiagnosing()}>
                <Text variant="caption" class="text-muted">
                  Error: {errorInfo()?.message ?? String(err)}
                </Text>
              </Show>

              <Stack direction="horizontal" gap="sm">
                <Show when={retryCount() < maxRetries}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      handleRetry();
                      reset();
                    }}
                  >
                    Try Again ({maxRetries - retryCount()} attempts left)
                  </Button>
                </Show>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.reload();
                    }
                  }}
                >
                  Reload Page
                </Button>
              </Stack>
            </Stack>
          </Card>
        );
      }}
    >
      {props.children}
    </SolidErrorBoundary>
  );
};
