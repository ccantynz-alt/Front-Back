import { Title } from "@solidjs/meta";
import { createSignal, createResource, Show, For, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Spinner,
} from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { useAuth } from "../../stores";
import { trpc } from "../../lib/trpc";
import { showToast } from "../../components/Toast";

type StatusFilter = "awaiting_review" | "escalated" | "all";

interface TicketRow {
  id: string;
  fromEmail: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  aiConfidence: number | null;
  aiDraft: string | null;
  updatedAt: Date | string;
}

function statusVariant(status: string): "success" | "warning" | "error" | "default" {
  if (status === "sent" || status === "resolved") return "success";
  if (status === "awaiting_review" || status === "ai_drafted") return "warning";
  if (status === "escalated") return "error";
  return "default";
}

function AdminGuard(props: { children: JSX.Element }): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = (): boolean => auth.currentUser()?.role === "admin";

  return (
    <ProtectedRoute>
      <Show
        when={isAdmin()}
        fallback={
          <Stack direction="vertical" gap="md" class="page-padded">
            <Text variant="h2" weight="bold">Access Denied</Text>
            <Text variant="body" class="text-muted">
              You do not have permission to view this page. Admin role required.
            </Text>
            <Button variant="primary" size="sm" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </Stack>
        }
      >
        {props.children}
      </Show>
    </ProtectedRoute>
  );
}

export default function AdminSupportPage(): JSX.Element {
  const toast = {
    success: (m: string): void => showToast(m, "success"),
    error: (m: string): void => showToast(m, "error"),
  };
  const [filter, setFilter] = createSignal<StatusFilter>("awaiting_review");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [editing, setEditing] = createSignal(false);
  const [editBody, setEditBody] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const ticketsInput = (): { statuses?: ("awaiting_review" | "escalated" | "ai_drafted")[] } => {
    if (filter() === "awaiting_review") {
      return { statuses: ["awaiting_review", "ai_drafted"] };
    }
    if (filter() === "escalated") {
      return { statuses: ["escalated"] };
    }
    return {};
  };

  const [tickets, { refetch: refetchTickets }] = createResource(
    () => filter(),
    () => trpc.support.listTickets.query(ticketsInput()),
  );

  const [detail, { refetch: refetchDetail }] = createResource(
    () => selectedId(),
    async (id: string | null) => {
      if (!id) return null;
      return await trpc.support.getTicket.query({ id });
    },
  );

  const selectTicket = (id: string): void => {
    setSelectedId(id);
    setEditing(false);
  };

  const handleApprove = async (): Promise<void> => {
    const id = selectedId();
    if (!id) return;
    setBusy(true);
    try {
      await trpc.support.approveDraft.mutate({ id });
      toast.success("Reply sent.");
      await refetchTickets();
      await refetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (): void => {
    const d = detail();
    if (!d) return;
    setEditBody(d.ticket.aiDraft ?? "");
    setEditing(true);
  };

  const handleSendEdit = async (): Promise<void> => {
    const id = selectedId();
    if (!id) return;
    setBusy(true);
    try {
      await trpc.support.editAndSend.mutate({ id, body: editBody() });
      toast.success("Edited reply sent.");
      setEditing(false);
      await refetchTickets();
      await refetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  };

  const handleEscalate = async (): Promise<void> => {
    const id = selectedId();
    if (!id) return;
    setBusy(true);
    try {
      await trpc.support.updateStatus.mutate({ id, status: "escalated" });
      toast.success("Ticket escalated.");
      await refetchTickets();
      await refetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to escalate.");
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (): Promise<void> => {
    const id = selectedId();
    if (!id) return;
    setBusy(true);
    try {
      await trpc.support.updateStatus.mutate({ id, status: "resolved" });
      toast.success("Ticket resolved.");
      await refetchTickets();
      await refetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve.");
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = (): void => {
    setEditing(false);
  };

  const setFilterAwaiting = (): void => {
    setFilter("awaiting_review");
  };
  const setFilterEscalated = (): void => {
    setFilter("escalated");
  };
  const setFilterAll = (): void => {
    setFilter("all");
  };

  return (
    <AdminGuard>
      <Title>Support Inbox - Crontech</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Support Inbox</Text>
          <Text variant="body" class="text-muted">
            The 8% that needs human review. Approve, edit, escalate, or resolve.
          </Text>
        </Stack>

        <Stack direction="horizontal" gap="sm">
          <Button
            variant={filter() === "awaiting_review" ? "primary" : "outline"}
            size="sm"
            onClick={setFilterAwaiting}
          >
            Awaiting review
            <Show when={(tickets() ?? []).length > 0 && filter() === "awaiting_review"}>
              {" "}({(tickets() ?? []).length})
            </Show>
          </Button>
          <Button
            variant={filter() === "escalated" ? "primary" : "outline"}
            size="sm"
            onClick={setFilterEscalated}
          >
            Escalated
          </Button>
          <Button
            variant={filter() === "all" ? "primary" : "outline"}
            size="sm"
            onClick={setFilterAll}
          >
            All
          </Button>
        </Stack>

        <div class="support-inbox-grid">
          <Card padding="md">
            <Stack direction="vertical" gap="sm">
              <Text variant="h4" weight="semibold">Tickets</Text>
              <Show when={!tickets.loading} fallback={<Spinner />}>
                <Show
                  when={(tickets() ?? []).length > 0}
                  fallback={<Text variant="body" class="text-muted">No tickets in this view.</Text>}
                >
                  <For each={tickets() as TicketRow[] | undefined}>
                    {(t) => (
                      <button
                        type="button"
                        class="support-ticket-row"
                        onClick={() => selectTicket(t.id)}
                      >
                        <Stack direction="vertical" gap="xs">
                          <Stack direction="horizontal" gap="sm" align="center">
                            <Badge variant={statusVariant(t.status)} size="sm">
                              {t.status}
                            </Badge>
                            <Text variant="caption" class="text-muted">
                              {t.category}
                            </Text>
                          </Stack>
                          <Text variant="body" weight="semibold">{t.subject}</Text>
                          <Text variant="caption" class="text-muted">
                            {t.fromEmail}
                          </Text>
                          <Show when={t.aiConfidence !== null}>
                            <Text variant="caption" class="text-muted">
                              AI confidence: {t.aiConfidence}%
                            </Text>
                          </Show>
                        </Stack>
                      </button>
                    )}
                  </For>
                </Show>
              </Show>
            </Stack>
          </Card>

          <Card padding="md">
            <Show
              when={detail() && !detail.loading}
              fallback={
                <Text variant="body" class="text-muted">
                  Select a ticket to view the thread.
                </Text>
              }
            >
              <Stack direction="vertical" gap="md">
                <Stack direction="vertical" gap="xs">
                  <Text variant="h3" weight="bold">
                    {detail()?.ticket.subject}
                  </Text>
                  <Text variant="caption" class="text-muted">
                    From {detail()?.ticket.fromEmail}
                  </Text>
                  <Stack direction="horizontal" gap="sm" align="center">
                    <Badge variant={statusVariant(detail()?.ticket.status ?? "")} size="sm">
                      {detail()?.ticket.status}
                    </Badge>
                    <Badge variant="default" size="sm">
                      {detail()?.ticket.category}
                    </Badge>
                    <Badge variant="default" size="sm">
                      Priority: {detail()?.ticket.priority}
                    </Badge>
                  </Stack>
                </Stack>

                <Stack direction="vertical" gap="sm">
                  <Text variant="h4" weight="semibold">Message thread</Text>
                  <For each={detail()?.messages ?? []}>
                    {(m) => (
                      <div
                        class={
                          m.direction === "inbound"
                            ? "support-msg support-msg-in"
                            : "support-msg support-msg-out"
                        }
                      >
                        <Text variant="caption" class="text-muted">
                          {m.direction === "inbound" ? "Customer" : "Support"} — {m.fromAddress}
                        </Text>
                        <Text variant="body">{m.body}</Text>
                      </div>
                    )}
                  </For>
                </Stack>

                <Show when={detail()?.ticket.aiDraft && detail()?.ticket.status !== "sent"}>
                  <Stack direction="vertical" gap="sm">
                    <Text variant="h4" weight="semibold">AI draft response</Text>
                    <Text variant="caption" class="text-muted">
                      Confidence: {detail()?.ticket.aiConfidence ?? 0}%
                    </Text>
                    <Show
                      when={editing()}
                      fallback={
                        <div class="support-draft">
                          <Text variant="body">{detail()?.ticket.aiDraft}</Text>
                        </div>
                      }
                    >
                      <textarea
                        class="support-draft-editor"
                        value={editBody()}
                        onInput={(e) => setEditBody(e.currentTarget.value)}
                        rows={10}
                      />
                    </Show>

                    <Stack direction="horizontal" gap="sm">
                      <Show
                        when={!editing()}
                        fallback={
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={handleSendEdit}
                              disabled={busy()}
                            >
                              Send edited reply
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancelEdit}
                              disabled={busy()}
                            >
                              Cancel
                            </Button>
                          </>
                        }
                      >
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleApprove}
                          disabled={busy()}
                        >
                          Approve and send
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleStartEdit}
                          disabled={busy()}
                        >
                          Edit and send
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleEscalate}
                          disabled={busy()}
                        >
                          Escalate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleResolve}
                          disabled={busy()}
                        >
                          Resolve
                        </Button>
                      </Show>
                    </Stack>
                  </Stack>
                </Show>
              </Stack>
            </Show>
          </Card>
        </div>
      </Stack>
    </AdminGuard>
  );
}
