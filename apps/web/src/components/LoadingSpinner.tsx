import type { JSX } from "solid-js";
import { Spinner, Stack, Text } from "@back-to-the-future/ui";

interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  fullscreen?: boolean;
}

/**
 * Centered loading indicator with optional label.
 * Use for quick async operations; prefer <Skeleton /> for data-heavy views.
 */
export function LoadingSpinner(props: LoadingSpinnerProps): JSX.Element {
  return (
    <div class={props.fullscreen ? "loading-fullscreen" : "loading-inline"} role="status" aria-live="polite">
      <Stack direction="vertical" align="center" justify="center" gap="sm">
        <Spinner size={props.size ?? "md"} />
        <Text variant="caption" class="text-muted">
          {props.label ?? "Loading..."}
        </Text>
      </Stack>
    </div>
  );
}
