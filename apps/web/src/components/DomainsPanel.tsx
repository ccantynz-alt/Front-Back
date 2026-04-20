// ── DomainsPanel ───────────────────────────────────────────────────────
//
// Premium custom domain management UI for a single project. Vercel /
// Netlify-style layout: list of connected domains with per-domain
// status (verifying / verified / failed), type (custom / subdomain),
// and SSL state. An "Add Domain" button opens AddDomainModal which
// walks the user through DNS record setup + verification.
//
// Uses existing tRPC procedures — projects.addDomain, projects.removeDomain,
// projects.verifyDomain — and never calls raw fetch.

import {
  createSignal,
  For,
  Show,
  Switch,
  Match,
  type JSX,
} from "solid-js";
import { Badge, Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { AddDomainModal } from "./AddDomainModal";
import { showToast } from "./Toast";
import { trpc } from "../lib/trpc";

// ── Types ──────────────────────────────────────────────────────────────

export type DomainVerificationStatus = "verifying" | "verified" | "failed";
export type DomainType = "custom" | "subdomain";

export interface DomainRecord {
  id: string;
  domain: string;
  isPrimary: boolean;
  dnsVerified: boolean;
  dnsVerifiedAt: string | null;
  createdAt: string;
}

export interface DomainsPanelProps {
  projectId: string;
  domains: DomainRecord[];
  /** Called after any mutation so the parent can refetch. */
  onChange?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** A domain is a subdomain if it has 3+ labels (e.g. app.example.com). */
export function classifyDomain(domain: string): DomainType {
  const labels = domain.split(".").filter((l) => l.length > 0);
  return labels.length >= 3 ? "subdomain" : "custom";
}

function statusFromRecord(
  record: DomainRecord,
  localFailure: boolean,
): DomainVerificationStatus {
  if (record.dnsVerified) return "verified";
  if (localFailure) return "failed";
  return "verifying";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── Main Component ─────────────────────────────────────────────────────

export function DomainsPanel(props: DomainsPanelProps): JSX.Element {
  const [modalOpen, setModalOpen] = createSignal(false);
  const [verifyingId, setVerifyingId] = createSignal<string | null>(null);
  const [failedIds, setFailedIds] = createSignal<Set<string>>(new Set());
  const [errorMap, setErrorMap] = createSignal<Record<string, string>>({});
  const [removingId, setRemovingId] = createSignal<string | null>(null);

  async function handleVerify(domain: DomainRecord): Promise<void> {
    setVerifyingId(domain.id);
    try {
      const result = await trpc.projects.verifyDomain.mutate({
        projectId: props.projectId,
        domainId: domain.id,
      });
      if (result.verified) {
        showToast(`${domain.domain} verified. SSL is being issued.`, "success");
        setFailedIds((s) => {
          const next = new Set(s);
          next.delete(domain.id);
          return next;
        });
        setErrorMap((m) => {
          const next = { ...m };
          delete next[domain.id];
          return next;
        });
        props.onChange?.();
      } else {
        const records = result.dnsRecords ?? [];
        const message =
          records.length === 0
            ? "No DNS records found yet. DNS propagation can take up to 48 hours."
            : `DNS resolves to ${records.join(", ")} — expected ${result.expectedRecord}.`;
        setFailedIds((s) => new Set(s).add(domain.id));
        setErrorMap((m) => ({ ...m, [domain.id]: message }));
        showToast(`Verification failed for ${domain.domain}`, "warning");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed.";
      setFailedIds((s) => new Set(s).add(domain.id));
      setErrorMap((m) => ({ ...m, [domain.id]: message }));
      showToast(message, "error");
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleRemove(domain: DomainRecord): Promise<void> {
    if (
      !confirm(
        `Remove ${domain.domain}? Traffic to this domain will stop resolving to this project.`,
      )
    ) {
      return;
    }
    setRemovingId(domain.id);
    try {
      await trpc.projects.removeDomain.mutate({
        projectId: props.projectId,
        domainId: domain.id,
      });
      showToast(`${domain.domain} removed`, "success");
      props.onChange?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove domain.";
      showToast(message, "error");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Stack direction="vertical" gap="lg">
      {/* Header */}
      <Card padding="lg">
        <Stack direction="horizontal" justify="between" align="center">
          <div>
            <Text variant="h4" weight="semibold">
              Domains
            </Text>
            <Text
              variant="caption"
              style={{ color: "var(--color-text-faint)" }}
            >
              Attach custom domains to this project. SSL is issued automatically
              once DNS verifies.
            </Text>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => setModalOpen(true)}
          >
            + Add Domain
          </Button>
        </Stack>
      </Card>

      {/* Domain List */}
      <Show
        when={props.domains.length > 0}
        fallback={
          <Card padding="lg">
            <Stack direction="vertical" gap="sm" class="items-center py-8">
              <Text
                variant="body"
                class="text-center"
                style={{ color: "var(--color-text-faint)" }}
              >
                No domains connected yet.
              </Text>
              <Text
                variant="caption"
                class="text-center"
                style={{ color: "var(--color-text-faint)" }}
              >
                Add your first domain to serve this project at your own URL.
              </Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(true)}
              >
                + Add Domain
              </Button>
            </Stack>
          </Card>
        }
      >
        <div class="space-y-3">
          <For each={props.domains}>
            {(domain) => (
              <DomainRow
                domain={domain}
                status={statusFromRecord(domain, failedIds().has(domain.id))}
                errorMessage={errorMap()[domain.id]}
                verifying={verifyingId() === domain.id}
                removing={removingId() === domain.id}
                onVerify={() => handleVerify(domain)}
                onRemove={() => handleRemove(domain)}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Add Domain Modal */}
      <AddDomainModal
        open={modalOpen()}
        projectId={props.projectId}
        onClose={() => setModalOpen(false)}
        onAdded={() => {
          setModalOpen(false);
          props.onChange?.();
        }}
      />
    </Stack>
  );
}

// ── Domain Row ─────────────────────────────────────────────────────────

interface DomainRowProps {
  domain: DomainRecord;
  status: DomainVerificationStatus;
  errorMessage: string | undefined;
  verifying: boolean;
  removing: boolean;
  onVerify: () => void;
  onRemove: () => void;
}

function DomainRow(props: DomainRowProps): JSX.Element {
  const type = (): DomainType => classifyDomain(props.domain.domain);

  return (
    <Card padding="md">
      <Stack direction="vertical" gap="sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <StatusDot status={props.status} />
            <a
              href={`https://${props.domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              class="truncate font-mono text-sm transition-colors hover:text-[var(--color-primary)]"
              style={{ color: "var(--color-text)" }}
            >
              {props.domain.domain}
            </a>
            <Badge
              variant="default"
              size="sm"
            >
              {type() === "subdomain" ? "Subdomain" : "Custom"}
            </Badge>
            <Show when={props.domain.isPrimary}>
              <Badge variant="info" size="sm">
                Primary
              </Badge>
            </Show>
            <StatusBadge status={props.status} />
            <SslBadge status={props.status} />
          </div>
          <Stack direction="horizontal" gap="sm">
            <Show when={props.status !== "verified"}>
              <Button
                variant="outline"
                size="sm"
                disabled={props.verifying}
                onClick={() => props.onVerify()}
              >
                {props.verifying ? "Checking DNS…" : "Verify"}
              </Button>
            </Show>
            <Button
              variant="outline"
              size="sm"
              disabled={props.removing}
              onClick={() => props.onRemove()}
            >
              {props.removing ? "Removing…" : "Remove"}
            </Button>
          </Stack>
        </div>

        {/* Status detail */}
        <Switch>
          <Match when={props.status === "verifying"}>
            <StatusDetail tone="info">
              <span class="inline-flex items-center gap-2">
                <PulseDot color="var(--color-info)" />
                DNS propagation can take up to 48 hours. We&apos;ll keep
                checking.
              </span>
            </StatusDetail>
          </Match>
          <Match when={props.status === "verified"}>
            <StatusDetail tone="success">
              <span class="inline-flex items-center gap-2">
                <Checkmark />
                SSL certificate active. Verified{" "}
                {formatDate(props.domain.dnsVerifiedAt)}.
              </span>
            </StatusDetail>
          </Match>
          <Match when={props.status === "failed"}>
            <StatusDetail tone="error">
              <span class="inline-flex items-center gap-2">
                <Cross />
                {props.errorMessage ??
                  "Verification failed. Double-check your DNS records and retry."}
              </span>
            </StatusDetail>
          </Match>
        </Switch>
      </Stack>
    </Card>
  );
}

// ── Status UI Atoms ────────────────────────────────────────────────────

function StatusDot(props: { status: DomainVerificationStatus }): JSX.Element {
  const color = (): string => {
    switch (props.status) {
      case "verified":
        return "var(--color-success)";
      case "failed":
        return "var(--color-danger)";
      default:
        return "var(--color-info)";
    }
  };
  return (
    <span
      class="h-2.5 w-2.5 flex-shrink-0 rounded-full"
      classList={{ "animate-pulse": props.status === "verifying" }}
      style={{ background: color() }}
      aria-label={`Status: ${props.status}`}
    />
  );
}

function StatusBadge(props: {
  status: DomainVerificationStatus;
}): JSX.Element {
  return (
    <Switch>
      <Match when={props.status === "verifying"}>
        <Badge variant="info" size="sm">
          Verifying
        </Badge>
      </Match>
      <Match when={props.status === "verified"}>
        <Badge variant="success" size="sm">
          Verified
        </Badge>
      </Match>
      <Match when={props.status === "failed"}>
        <Badge variant="error" size="sm">
          Failed
        </Badge>
      </Match>
    </Switch>
  );
}

function SslBadge(props: { status: DomainVerificationStatus }): JSX.Element {
  return (
    <Switch>
      <Match when={props.status === "verified"}>
        <Badge variant="success" size="sm">
          SSL
        </Badge>
      </Match>
      <Match when={props.status === "verifying"}>
        <Badge variant="default" size="sm">
          SSL pending
        </Badge>
      </Match>
      <Match when={props.status === "failed"}>
        <Badge variant="default" size="sm">
          SSL blocked
        </Badge>
      </Match>
    </Switch>
  );
}

function StatusDetail(props: {
  tone: "info" | "success" | "error";
  children: JSX.Element;
}): JSX.Element {
  const style = (): Record<string, string> => {
    switch (props.tone) {
      case "success":
        return {
          background: "rgba(16, 185, 129, 0.08)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          color: "var(--color-success-text)",
        };
      case "error":
        return {
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          color: "var(--color-danger-text)",
        };
      default:
        return {
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          color: "var(--color-primary-text)",
        };
    }
  };

  return (
    <div
      class="rounded-lg px-3 py-2 text-xs"
      style={style()}
    >
      {props.children}
    </div>
  );
}

function PulseDot(props: { color: string }): JSX.Element {
  return (
    <span
      class="inline-block h-2 w-2 animate-pulse rounded-full"
      style={{ background: props.color }}
    />
  );
}

function Checkmark(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 10l3 3 7-7"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function Cross(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}
