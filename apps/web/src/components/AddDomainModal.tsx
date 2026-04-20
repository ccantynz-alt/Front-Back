// ── AddDomainModal ─────────────────────────────────────────────────────
//
// Premium add-domain flow. Mirrors the Vercel/Netlify experience:
//
//   Step 1. Enter domain name (client-side regex validation)
//   Step 2. Add the domain, receive DNS instructions (CNAME for
//           subdomains, A record for apex), copy-to-clipboard for
//           every value.
//   Step 3. Click "Verify" — calls trpc.projects.verifyDomain.
//
// Uses existing tRPC procedures only: projects.addDomain and
// projects.verifyDomain.

import {
  createSignal,
  createMemo,
  Show,
  Switch,
  Match,
  For,
  type JSX,
} from "solid-js";
import { Badge, Button, Modal, Stack, Text } from "@back-to-the-future/ui";
import { showToast } from "./Toast";
import { classifyDomain } from "./DomainsPanel";
import type { DomainType } from "./DomainsPanel";
import { trpc } from "../lib/trpc";

// ── Public API ─────────────────────────────────────────────────────────

export interface AddDomainModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onAdded?: () => void;
}

// Mirror of the server-side regex in apps/api/src/trpc/procedures/projects.ts.
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const EDGE_TARGET_HOSTNAME = "edge.crontech.app";
const EDGE_TARGET_IP = "204.168.251.243";

type Step = "input" | "configure";

interface DnsInstruction {
  type: "A" | "CNAME";
  host: string;
  value: string;
  ttl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function instructionsFor(domain: string): DnsInstruction[] {
  const type: DomainType = classifyDomain(domain);
  if (type === "subdomain") {
    const host = domain.split(".")[0] ?? domain;
    return [
      {
        type: "CNAME",
        host,
        value: EDGE_TARGET_HOSTNAME,
        ttl: "Auto",
      },
    ];
  }
  return [
    {
      type: "A",
      host: "@",
      value: EDGE_TARGET_IP,
      ttl: "Auto",
    },
  ];
}

async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

// ── Main Component ─────────────────────────────────────────────────────

export function AddDomainModal(props: AddDomainModalProps): JSX.Element {
  const [step, setStep] = createSignal<Step>("input");
  const [domainValue, setDomainValue] = createSignal("");
  const [validationError, setValidationError] = createSignal<string | null>(
    null,
  );
  const [submitting, setSubmitting] = createSignal(false);
  const [addedDomainId, setAddedDomainId] = createSignal<string | null>(null);
  const [addedDomain, setAddedDomain] = createSignal<string | null>(null);
  const [verifying, setVerifying] = createSignal(false);
  const [verifyResult, setVerifyResult] = createSignal<
    | { ok: true }
    | { ok: false; message: string }
    | null
  >(null);

  function reset(): void {
    setStep("input");
    setDomainValue("");
    setValidationError(null);
    setSubmitting(false);
    setAddedDomainId(null);
    setAddedDomain(null);
    setVerifying(false);
    setVerifyResult(null);
  }

  function handleClose(): void {
    reset();
    props.onClose();
  }

  function validateLocal(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) return "Enter a domain.";
    if (trimmed.length > 253) return "Domain is too long (max 253 characters).";
    if (!DOMAIN_REGEX.test(trimmed)) {
      return "Enter a valid domain — e.g. app.example.com";
    }
    return null;
  }

  async function handleAdd(): Promise<void> {
    const trimmed = domainValue().trim().toLowerCase();
    const err = validateLocal(trimmed);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      const result = await trpc.projects.addDomain.mutate({
        projectId: props.projectId,
        domain: trimmed,
      });
      setAddedDomainId(result.id);
      setAddedDomain(result.domain);
      setStep("configure");
      showToast(`${result.domain} added. Configure DNS to verify.`, "info");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to add domain.";
      setValidationError(message);
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(): Promise<void> {
    const id = addedDomainId();
    if (!id) return;
    setVerifying(true);
    try {
      const result = await trpc.projects.verifyDomain.mutate({
        projectId: props.projectId,
        domainId: id,
      });
      if (result.verified) {
        setVerifyResult({ ok: true });
        showToast(`${result.domain} verified. SSL issued.`, "success");
        props.onAdded?.();
        // Close shortly after success so the user sees the check.
        setTimeout(() => handleClose(), 900);
      } else {
        const records = result.dnsRecords ?? [];
        const message =
          records.length === 0
            ? "No DNS records detected yet. Propagation can take up to 48 hours."
            : `DNS resolves to ${records.join(", ")} — expected ${result.expectedRecord}.`;
        setVerifyResult({ ok: false, message });
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Verification failed.";
      setVerifyResult({ ok: false, message });
    } finally {
      setVerifying(false);
    }
  }

  const instructions = createMemo((): DnsInstruction[] => {
    const d = addedDomain();
    if (!d) return [];
    return instructionsFor(d);
  });

  return (
    <Modal
      open={props.open}
      title="Add a custom domain"
      description="Connect any domain you own. SSL is provisioned automatically once DNS verifies."
      size="lg"
      onClose={handleClose}
    >
      <Switch>
        {/* Step 1 — Input */}
        <Match when={step() === "input"}>
          <Stack direction="vertical" gap="md">
            <div>
              <label
                class="mb-1 block text-xs font-medium"
                style={{ color: "var(--color-text-muted)" }}
                for="add-domain-input"
              >
                Domain
              </label>
              <input
                id="add-domain-input"
                type="text"
                autofocus
                value={domainValue()}
                onInput={(e) => {
                  setDomainValue(e.currentTarget.value);
                  if (validationError()) setValidationError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                placeholder="app.example.com"
                class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 font-mono text-sm placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary)] focus:outline-none"
                style={{ color: "var(--color-text)" }}
              />
              <Show when={validationError()}>
                <Text
                  variant="caption"
                  class="mt-1 block"
                  style={{ color: "var(--color-danger)" }}
                >
                  {validationError()}
                </Text>
              </Show>
              <Text
                variant="caption"
                class="mt-2 block"
                style={{ color: "var(--color-text-faint)" }}
              >
                Use an apex domain (example.com) or a subdomain
                (app.example.com). IDN domains should be entered in punycode.
              </Text>
            </div>

            <Stack
              direction="horizontal"
              gap="sm"
              justify="end"
              class="pt-2"
            >
              <Button
                variant="outline"
                size="md"
                onClick={() => handleClose()}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={submitting()}
                onClick={() => void handleAdd()}
              >
                {submitting() ? "Adding…" : "Add Domain"}
              </Button>
            </Stack>
          </Stack>
        </Match>

        {/* Step 2 — Configure DNS + Verify */}
        <Match when={step() === "configure"}>
          <Stack direction="vertical" gap="md">
            <div
              class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2"
            >
              <Text
                variant="caption"
                style={{ color: "var(--color-text-faint)" }}
              >
                Domain
              </Text>
              <Text
                variant="body"
                class="font-mono text-sm"
                style={{ color: "var(--color-text)" }}
              >
                {addedDomain()}
              </Text>
            </div>

            <div>
              <Text variant="body" weight="semibold">
                Add this DNS record at your registrar
              </Text>
              <Text
                variant="caption"
                class="mt-1 block"
                style={{ color: "var(--color-text-faint)" }}
              >
                {classifyDomain(addedDomain() ?? "") === "subdomain"
                  ? "CNAME records route subdomain traffic to our edge network."
                  : "A records route apex domain traffic to our edge IP."}
              </Text>
            </div>

            <div class="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <div
                class="grid grid-cols-12 gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-faint)" }}
              >
                <div class="col-span-2">Type</div>
                <div class="col-span-3">Host</div>
                <div class="col-span-5">Value</div>
                <div class="col-span-2 text-right">TTL</div>
              </div>
              <For each={instructions()}>
                {(row) => (
                  <div
                    class="grid grid-cols-12 items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 last:border-b-0"
                  >
                    <div class="col-span-2">
                      <Badge variant="info" size="sm">
                        {row.type}
                      </Badge>
                    </div>
                    <CopyCell class="col-span-3" value={row.host} />
                    <CopyCell class="col-span-5" value={row.value} />
                    <div
                      class="col-span-2 text-right font-mono text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {row.ttl}
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Verify result */}
            <Show when={verifyResult()}>
              {(res) => (
                <Switch>
                  <Match when={res().ok}>
                    <div
                      class="rounded-lg px-3 py-2 text-sm"
                      style={{
                        background: "rgba(16, 185, 129, 0.08)",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                        color: "var(--color-success-text)",
                      }}
                    >
                      Domain verified. SSL certificate is being issued.
                    </div>
                  </Match>
                  <Match when={!res().ok}>
                    <div
                      class="rounded-lg px-3 py-2 text-sm"
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        color: "var(--color-danger-text)",
                      }}
                    >
                      {(res() as { ok: false; message: string }).message}
                    </div>
                  </Match>
                </Switch>
              )}
            </Show>

            <Stack direction="horizontal" gap="sm" justify="between">
              <Text
                variant="caption"
                style={{ color: "var(--color-text-faint)" }}
              >
                DNS propagation can take up to 48 hours.
              </Text>
              <Stack direction="horizontal" gap="sm">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => handleClose()}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={verifying()}
                  onClick={() => void handleVerify()}
                >
                  {verifying() ? "Verifying DNS…" : "Verify"}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Match>
      </Switch>
    </Modal>
  );
}

// ── CopyCell ───────────────────────────────────────────────────────────

function CopyCell(props: { class?: string; value: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);

  async function handleCopy(): Promise<void> {
    const ok = await copyToClipboard(props.value);
    if (ok) {
      setCopied(true);
      showToast(`Copied ${props.value}`, "success", 1500);
      setTimeout(() => setCopied(false), 1500);
    } else {
      showToast("Copy failed — clipboard unavailable.", "error");
    }
  }

  return (
    <div class={`flex items-center gap-2 ${props.class ?? ""}`}>
      <code
        class="flex-1 truncate rounded bg-[var(--color-bg-subtle)] px-2 py-1 font-mono text-xs"
        style={{ color: "var(--color-text)" }}
        title={props.value}
      >
        {props.value}
      </code>
      <button
        type="button"
        class="rounded border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        style={{ color: "var(--color-text-muted)" }}
        aria-label={`Copy ${props.value}`}
        onClick={() => void handleCopy()}
      >
        {copied() ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
