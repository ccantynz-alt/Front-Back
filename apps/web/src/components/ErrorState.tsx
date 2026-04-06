import type { JSX } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  supportHref?: string;
}

/**
 * Friendly, plain-English error state.
 * Never expose stack traces to users.
 */
export function ErrorState(props: ErrorStateProps): JSX.Element {
  return (
    <Card padding="lg" class="error-state-card">
      <Stack direction="vertical" gap="md" align="center">
        <div class="error-state-icon" aria-hidden="true">!</div>
        <Text variant="h3" weight="semibold" align="center">
          {props.title ?? "Something went sideways"}
        </Text>
        <Text variant="body" class="text-muted" align="center">
          {props.message ?? "We hit a snag loading this page. It's not you — it's us. Try again in a moment."}
        </Text>
        <Stack direction="horizontal" gap="sm" justify="center">
          {props.onRetry ? (
            <Button variant="primary" onClick={props.onRetry}>
              Try again
            </Button>
          ) : null}
          <a href={props.supportHref ?? "/docs"}>
            <Button variant="outline">Contact support</Button>
          </a>
        </Stack>
      </Stack>
    </Card>
  );
}

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: string;
}

/**
 * Friendly empty state with a clear next action.
 */
export function EmptyState(props: EmptyStateProps): JSX.Element {
  return (
    <Card padding="lg" class="empty-state-card">
      <Stack direction="vertical" gap="md" align="center">
        <div class="empty-state-icon" aria-hidden="true">{props.icon ?? "+"}</div>
        <Text variant="h4" weight="semibold" align="center">{props.title}</Text>
        <Text variant="body" class="text-muted" align="center">{props.message}</Text>
        {props.actionHref && props.actionLabel ? (
          <a href={props.actionHref}>
            <Button variant="primary">{props.actionLabel}</Button>
          </a>
        ) : null}
      </Stack>
    </Card>
  );
}
