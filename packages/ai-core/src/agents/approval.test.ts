import { describe, test, expect } from "bun:test";
import {
  classifyRisk,
  requiresApproval,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  getPendingApprovals,
  getApprovalRequest,
} from "./approval";

describe("Risk Classification", () => {
  test("classifies destructive actions as critical", () => {
    expect(classifyRisk("delete_file")).toBe("critical");
    expect(classifyRisk("delete_page")).toBe("critical");
    expect(classifyRisk("deploy_production")).toBe("critical");
    expect(classifyRisk("reset_database")).toBe("critical");
  });

  test("classifies high-risk actions", () => {
    expect(classifyRisk("modify_schema")).toBe("high");
    expect(classifyRisk("bulk_update")).toBe("high");
    expect(classifyRisk("export_data")).toBe("high");
  });

  test("classifies create/update as medium", () => {
    expect(classifyRisk("create_page")).toBe("medium");
    expect(classifyRisk("update_content")).toBe("medium");
  });

  test("classifies unknown actions as low", () => {
    expect(classifyRisk("read_data")).toBe("low");
    expect(classifyRisk("search")).toBe("low");
  });
});

describe("requiresApproval", () => {
  test("requires approval for critical and high-risk actions", () => {
    expect(requiresApproval("delete_file")).toBe(true);
    expect(requiresApproval("modify_schema")).toBe(true);
  });

  test("does not require approval for medium and low-risk actions", () => {
    expect(requiresApproval("create_page")).toBe(false);
    expect(requiresApproval("search")).toBe(false);
  });
});

describe("Approval Workflow", () => {
  test("creates a pending approval request", () => {
    const request = createApprovalRequest(
      "site-builder",
      "session-1",
      "delete_page",
      "Delete the About page",
    );
    expect(request.status).toBe("pending");
    expect(request.riskLevel).toBe("critical");
    expect(request.agentId).toBe("site-builder");
  });

  test("approves a pending request", () => {
    const request = createApprovalRequest(
      "agent-1",
      "session-2",
      "deploy_production",
      "Deploy to production",
    );
    const approved = approveRequest(request.id, "admin-user");
    expect(approved).toBeDefined();
    expect(approved!.status).toBe("approved");
    expect(approved!.resolvedBy).toBe("admin-user");
  });

  test("rejects a pending request", () => {
    const request = createApprovalRequest(
      "agent-1",
      "session-3",
      "reset_database",
      "Reset the database",
    );
    const rejected = rejectRequest(request.id, "admin-user");
    expect(rejected).toBeDefined();
    expect(rejected!.status).toBe("rejected");
  });

  test("returns undefined for non-existent request", () => {
    expect(approveRequest("nonexistent", "user")).toBeUndefined();
    expect(rejectRequest("nonexistent", "user")).toBeUndefined();
  });

  test("getPendingApprovals returns only pending requests", () => {
    const r1 = createApprovalRequest("a", "s-filter", "delete_file", "d1");
    const r2 = createApprovalRequest("a", "s-filter", "delete_page", "d2");
    approveRequest(r1.id, "user");

    const pending = getPendingApprovals("s-filter");
    expect(pending.some((r) => r.id === r2.id)).toBe(true);
    expect(pending.some((r) => r.id === r1.id)).toBe(false);
  });

  test("getApprovalRequest retrieves by ID", () => {
    const request = createApprovalRequest("a", "s", "delete_file", "d");
    const found = getApprovalRequest(request.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(request.id);
  });
});
