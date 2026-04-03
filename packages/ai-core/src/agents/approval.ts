// ── Human-in-the-Loop Approval System ────────────────────────────────
// AI agents request approval for destructive or high-risk actions.
// No autonomous destructive actions — ever.

import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────────

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  sessionId: z.string(),
  action: z.string(),
  description: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  details: z.record(z.unknown()).optional(),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  createdAt: z.number(),
  expiresAt: z.number(),
  resolvedAt: z.number().optional(),
  resolvedBy: z.string().optional(),
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// ── Risk Classification ──────────────────────────────────────────────

const DESTRUCTIVE_ACTIONS = new Set([
  "delete_file",
  "delete_page",
  "delete_component",
  "drop_table",
  "reset_database",
  "remove_user",
  "publish_site",
  "deploy_production",
  "modify_auth",
  "change_permissions",
]);

const HIGH_RISK_ACTIONS = new Set([
  "modify_schema",
  "bulk_update",
  "export_data",
  "send_email",
  "external_api_call",
  "create_webhook",
]);

export function classifyRisk(action: string): ApprovalRequest["riskLevel"] {
  if (DESTRUCTIVE_ACTIONS.has(action)) return "critical";
  if (HIGH_RISK_ACTIONS.has(action)) return "high";
  if (action.startsWith("create_") || action.startsWith("update_")) return "medium";
  return "low";
}

export function requiresApproval(action: string): boolean {
  const risk = classifyRisk(action);
  return risk === "critical" || risk === "high";
}

// ── Approval Store ───────────────────────────────────────────────────

const APPROVAL_TTL_MS = 5 * 60 * 1000; // 5 minutes

const pendingApprovals = new Map<string, ApprovalRequest>();

// Cleanup expired approvals
setInterval(() => {
  const now = Date.now();
  for (const [id, request] of pendingApprovals) {
    if (now > request.expiresAt && request.status === "pending") {
      request.status = "expired";
      pendingApprovals.delete(id);
    }
  }
}, 30_000);

export function createApprovalRequest(
  agentId: string,
  sessionId: string,
  action: string,
  description: string,
  details?: Record<string, unknown>,
): ApprovalRequest {
  const request: ApprovalRequest = {
    id: crypto.randomUUID(),
    agentId,
    sessionId,
    action,
    description,
    riskLevel: classifyRisk(action),
    details,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + APPROVAL_TTL_MS,
  };

  pendingApprovals.set(request.id, request);
  return request;
}

export function approveRequest(requestId: string, approvedBy: string): ApprovalRequest | undefined {
  const request = pendingApprovals.get(requestId);
  if (!request || request.status !== "pending") return undefined;

  if (Date.now() > request.expiresAt) {
    request.status = "expired";
    pendingApprovals.delete(requestId);
    return undefined;
  }

  request.status = "approved";
  request.resolvedAt = Date.now();
  request.resolvedBy = approvedBy;
  return request;
}

export function rejectRequest(requestId: string, rejectedBy: string): ApprovalRequest | undefined {
  const request = pendingApprovals.get(requestId);
  if (!request || request.status !== "pending") return undefined;

  request.status = "rejected";
  request.resolvedAt = Date.now();
  request.resolvedBy = rejectedBy;
  return request;
}

export function getPendingApprovals(sessionId?: string): ApprovalRequest[] {
  const all = Array.from(pendingApprovals.values()).filter(
    (r) => r.status === "pending",
  );
  if (sessionId) return all.filter((r) => r.sessionId === sessionId);
  return all;
}

export function getApprovalRequest(requestId: string): ApprovalRequest | undefined {
  return pendingApprovals.get(requestId);
}
