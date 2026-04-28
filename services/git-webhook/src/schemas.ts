// ── git-webhook · public Zod contracts ──────────────────────────────────
//
// These schemas form the contract surface between this service and
// downstream consumers (build-runner, deploy-orchestrator). Keep them
// stable. Breaking changes require coordination with consumers.

import { z } from "zod";

// ── BuildRequested ─────────────────────────────────────────────────────
//
// Emitted whenever a validated GitHub push webhook resolves to a branch
// that maps to a deploy environment. This is the primary contract that
// the build-runner agent consumes.
//
// Field notes:
//   deliveryId  – GitHub `X-GitHub-Delivery` UUID; used as the idempotency
//                 key by the dedup layer and by downstream consumers that
//                 want exactly-once semantics.
//   tenantId    – Crontech-internal tenant identifier. NOT a GitHub repo
//                 owner; the same GitHub repo can be wired to multiple
//                 tenants with different secrets.
//   repo        – `owner/name` form, taken from the push payload.
//   ref         – Full git ref, e.g. `refs/heads/main`.
//   sha         – Head commit SHA after the push.
//   branch      – Convenience derivation of `ref` (the part after
//                 `refs/heads/`). Stored explicitly so consumers do not
//                 have to re-parse.
//   pusher      – `{ name, email? }` of the user who pushed.
//   timestamp   – ISO-8601 instant the build was requested (server clock).
//   environment – Which deploy env this branch maps to (production /
//                 preview / arbitrary tenant-defined string). Defaults to
//                 `preview` when the branch matches a configured filter
//                 but no explicit env mapping exists.
export const BuildRequestedSchema = z.object({
  deliveryId: z.string().min(1),
  tenantId: z.string().min(1),
  repo: z
    .string()
    .min(3)
    .regex(/^[^/]+\/[^/]+$/, "repo must be in 'owner/name' form"),
  ref: z.string().min(1),
  sha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "sha must be a hex commit SHA"),
  branch: z.string().min(1),
  pusher: z.object({
    name: z.string().min(1),
    email: z.email().optional(),
  }),
  timestamp: z.iso.datetime(),
  environment: z.string().min(1),
});

export type BuildRequested = z.infer<typeof BuildRequestedSchema>;

// ── Tenant configuration ───────────────────────────────────────────────
//
// One entry per tenant + repo binding. The webhook receiver looks up the
// matching record by repo `full_name` and tenant id (via the URL path or
// a header) and uses the stored secret + branch map to validate / route.

export const BranchEnvironmentMapSchema = z.record(
  z.string().min(1),
  z.string().min(1),
);
export type BranchEnvironmentMap = z.infer<typeof BranchEnvironmentMapSchema>;

export const TenantWebhookConfigSchema = z.object({
  tenantId: z.string().min(1),
  repo: z
    .string()
    .min(3)
    .regex(/^[^/]+\/[^/]+$/, "repo must be in 'owner/name' form"),
  // Per-tenant HMAC secret. v1: in-memory. v2: stored in Turso under
  // `tenant_webhook_secrets` keyed by (tenant_id, repo). Rotation is a
  // simple row update; the current value wins.
  secret: z.string().min(8),
  // Map of branch name -> deploy environment. A branch absent from this
  // map is silently dropped (no build triggered). `*` wildcard maps any
  // branch to the named env (useful for preview-everything tenants).
  branchEnvironments: BranchEnvironmentMapSchema.default({}),
  // Default env to use when wildcard `*` is matched and no explicit
  // mapping is present. Only consulted when `*` is in the map.
  defaultEnvironment: z.string().min(1).default("preview"),
});
export type TenantWebhookConfig = z.infer<typeof TenantWebhookConfigSchema>;

// ── Webhook delivery shape (subset of GitHub push payload) ─────────────
//
// We do NOT validate the entire GitHub payload — that surface is huge
// and not all of it is documented stably. We pluck only the fields we
// care about, with permissive `unknown` passthrough.

export const PusherSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
});

export const RepositorySchema = z.object({
  full_name: z.string().min(3),
});

export const PushPayloadSchema = z
  .object({
    ref: z.string(),
    after: z.string(),
    deleted: z.boolean().optional(),
    pusher: PusherSchema,
    repository: RepositorySchema,
  })
  .loose();
export type PushPayload = z.infer<typeof PushPayloadSchema>;
