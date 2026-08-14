import { describe, it, expect } from "vitest";
import { canPerformWorkflowAction, type ApprovalStatus, type RiskStatus } from "@/lib/riskWorkflow";
import type { UserRole } from "@/contexts/AuthContext";

/**
 * Guard suite driven by docs/state-transition-spec.md §1 (Risk approval
 * pipeline) and the escalate/deescalate rows of §2 (Risk lifecycle).
 * Authority: canPerformWorkflowAction() in src/lib/riskWorkflow.ts.
 */

const ALL_ROLES: UserRole[] = ["RC", "RR", "RO", "RMD", "CRO", "ERMSC", "EC", "RCB", "SUPERVISOR", "ADMIN", "USER"];

function allowedRoles(action: Parameters<typeof canPerformWorkflowAction>[0], status: ApprovalStatus | RiskStatus, context = {}) {
  return ALL_ROLES.filter((role) => canPerformWorkflowAction(action, status, role, context));
}

describe("state-transition-spec §1 — Draft", () => {
  it("submit: only RC, RO, RMD, ADMIN may move Draft → Submitted", () => {
    expect(allowedRoles("submit", "Draft")).toEqual(expect.arrayContaining(["RC", "RO", "RMD", "ADMIN"]));
    expect(allowedRoles("submit", "Draft")).toHaveLength(4);
  });

  it("no other action is available while Draft", () => {
    for (const action of ["review", "approve", "return", "withdraw"] as const) {
      expect(allowedRoles(action, "Draft")).toEqual([]);
    }
  });
});

describe("state-transition-spec §1 — Submitted", () => {
  it("review: only RR, RMD, CRO, ADMIN may claim", () => {
    expect(allowedRoles("review", "Submitted").sort()).toEqual(["ADMIN", "CRO", "RMD", "RR"]);
  });

  it("approve: RR, SUPERVISOR, CRO, RMD, ADMIN", () => {
    expect(allowedRoles("approve", "Submitted").sort()).toEqual(["ADMIN", "CRO", "RMD", "RR", "SUPERVISOR"]);
  });

  it("return: union of reviewer and approver sets", () => {
    expect(allowedRoles("return", "Submitted").sort()).toEqual(["ADMIN", "CRO", "RMD", "RR", "SUPERVISOR"]);
  });

  it("withdraw: only the submitter (or ADMIN) while unclaimed", () => {
    expect(canPerformWorkflowAction("withdraw", "Submitted", "RC", { isSubmitter: true, hasReviewer: false })).toBe(true);
    expect(canPerformWorkflowAction("withdraw", "Submitted", "ADMIN", { hasReviewer: false })).toBe(true);
  });

  it("withdraw is blocked once a reviewer has claimed (current_reviewer_id IS NOT NULL)", () => {
    expect(canPerformWorkflowAction("withdraw", "Submitted", "RC", { isSubmitter: true, hasReviewer: true })).toBe(false);
  });

  it("withdraw is blocked for non-submitter, non-ADMIN roles", () => {
    expect(canPerformWorkflowAction("withdraw", "Submitted", "RR", { isSubmitter: false, hasReviewer: false })).toBe(false);
  });
});

describe("state-transition-spec §1 — Under Review", () => {
  it("approve/return use the same role sets as Submitted", () => {
    expect(allowedRoles("approve", "Under Review").sort()).toEqual(allowedRoles("approve", "Submitted").sort());
    expect(allowedRoles("return", "Under Review").sort()).toEqual(allowedRoles("return", "Submitted").sort());
  });

  it("withdraw is no longer available once Under Review", () => {
    expect(canPerformWorkflowAction("withdraw", "Under Review", "ADMIN", { isSubmitter: true, hasReviewer: false })).toBe(false);
  });
});

describe("state-transition-spec §1 — Returned", () => {
  it("submit: RC, RO, RMD, ADMIN return the risk to Submitted", () => {
    expect(allowedRoles("submit", "Returned").sort()).toEqual(["ADMIN", "RC", "RMD", "RO"]);
  });
});

describe("state-transition-spec §1 — Approved (terminal for the pipeline)", () => {
  it("no pipeline action is available once Approved", () => {
    for (const action of ["submit", "review", "approve", "return", "withdraw"] as const) {
      expect(allowedRoles(action, "Approved")).toEqual([]);
    }
  });
});

describe("state-transition-spec §2 — escalate / deescalate guards", () => {
  it("escalate is available to approvers while not Approved and lifecycle not Mitigated/Crystallized", () => {
    expect(allowedRoles("escalate", "Submitted", { lifecycleStatus: "In Review" }).sort()).toEqual(
      ["ADMIN", "CRO", "RMD", "RR", "SUPERVISOR"]
    );
  });

  it("escalate is blocked once the pipeline is Approved", () => {
    expect(canPerformWorkflowAction("escalate", "Approved", "CRO", { lifecycleStatus: "In Review" })).toBe(false);
  });

  it("escalate is blocked once the lifecycle is Mitigated or Crystallized", () => {
    expect(canPerformWorkflowAction("escalate", "Submitted", "CRO", { lifecycleStatus: "Mitigated" })).toBe(false);
    expect(canPerformWorkflowAction("escalate", "Submitted", "CRO", { lifecycleStatus: "Crystallized" })).toBe(false);
  });

  it("deescalate: only ADMIN, CRO, RMD may return an Escalated risk to In Review", () => {
    expect(allowedRoles("deescalate", "Submitted", { lifecycleStatus: "Escalated" }).sort()).toEqual(["ADMIN", "CRO", "RMD"]);
  });

  it("deescalate is blocked unless the lifecycle status is Escalated", () => {
    expect(canPerformWorkflowAction("deescalate", "Submitted", "ADMIN", { lifecycleStatus: "In Review" })).toBe(false);
  });
});

describe("state-transition-spec — unauthenticated / unknown", () => {
  it("no role means no action is ever permitted", () => {
    for (const action of ["submit", "review", "approve", "return", "withdraw", "escalate", "deescalate"] as const) {
      expect(canPerformWorkflowAction(action, "Draft", undefined)).toBe(false);
    }
  });
});
