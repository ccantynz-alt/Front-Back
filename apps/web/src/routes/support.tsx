import { Title } from "@solidjs/meta";
import { createSignal, Show, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { trpc } from "../lib/trpc";
import { showToast } from "../components/Toast";

type Category =
  | "billing"
  | "technical"
  | "bug"
  | "feature"
  | "sales"
  | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "billing", label: "Billing & subscriptions" },
  { value: "technical", label: "Technical question" },
  { value: "bug", label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "sales", label: "Sales & enterprise" },
  { value: "other", label: "Something else" },
];

export default function SupportPage(): JSX.Element {
  const [category, setCategory] = createSignal<Category>("technical");
  const [subject, setSubject] = createSignal("");
  const [body, setBody] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [submitted, setSubmitted] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent): Promise<void> => {
    e.preventDefault();
    if (subject().trim().length < 2 || body().trim().length < 5) {
      showToast("Please fill in a subject and a detailed message.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await trpc.support.submitRequest.mutate({
        category: category(),
        subject: subject().trim(),
        body: body().trim(),
      });
      showToast("Got it. We will respond within minutes.", "success");
      setSubmitted(true);
      setSubject("");
      setBody("");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Something went wrong.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = (): void => {
    setSubmitted(false);
  };

  return (
    <ProtectedRoute>
      <Title>Support - Marco Reid</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">How can we help?</Text>
          <Text variant="body" class="text-muted">
            Most replies arrive within minutes. Anything our AI cannot answer goes
            straight to a human teammate.
          </Text>
        </Stack>

        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">Self-service first</Text>
            <Text variant="body">
              Browse the docs at <A href="/docs">/docs</A> for instant answers,
              or open the in-app SupportBot from any page for a real-time chat.
            </Text>
          </Stack>
        </Card>

        <Card padding="md">
          <form onSubmit={handleSubmit}>
            <Stack direction="vertical" gap="md">
              <Text variant="h3" weight="semibold">Send us a message</Text>

              <Stack direction="vertical" gap="xs">
                <label for="support-category">
                  <Text variant="caption">Category</Text>
                </label>
                <select
                  id="support-category"
                  class="form-select"
                  value={category()}
                  onChange={(e) => setCategory(e.currentTarget.value as Category)}
                  disabled={submitting()}
                >
                  {CATEGORIES.map((c) => (
                    <option value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Stack>

              <Stack direction="vertical" gap="xs">
                <label for="support-subject">
                  <Text variant="caption">Subject</Text>
                </label>
                <input
                  id="support-subject"
                  class="form-input"
                  type="text"
                  value={subject()}
                  onInput={(e) => setSubject(e.currentTarget.value)}
                  disabled={submitting()}
                  placeholder="Short summary"
                  required
                />
              </Stack>

              <Stack direction="vertical" gap="xs">
                <label for="support-body">
                  <Text variant="caption">Message</Text>
                </label>
                <textarea
                  id="support-body"
                  class="form-textarea"
                  value={body()}
                  onInput={(e) => setBody(e.currentTarget.value)}
                  disabled={submitting()}
                  placeholder="Describe what you need. The more detail, the faster the answer."
                  rows={8}
                  required
                />
              </Stack>

              <Stack direction="horizontal" gap="sm">
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={submitting()}
                >
                  {submitting() ? "Sending..." : "Send message"}
                </Button>
                <Show when={submitted()}>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={handleReset}
                  >
                    Send another
                  </Button>
                </Show>
              </Stack>

              <Text variant="caption" class="text-muted">
                We typically respond within 5 minutes during business hours and
                under 1 hour outside of them.
              </Text>
            </Stack>
          </form>
        </Card>
      </Stack>
    </ProtectedRoute>
  );
}
