import { describe, it, expect } from "vitest";
import {
  canPerformWorkflowAction,
  isValidRiskStatus,
  VALID_RISK_STATUSES,
  statusBadgeVariant,
} from "@/lib/riskWorkflow";

describe("isValidRiskStatus", () => {
  it("accepts every enum value", () => {
    for (const s of VALID_RISK_STATUSES) expect(isValidRiskStatus(s)).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isValidRiskStatus("bogus")).toBe(false);
    expect(isValidRiskStatus(null)).toBe(false);
    expect(isValidRiskStatus(undefined)).toBe(false);
  });
});

describe("canPerformWorkflowAction", () => {
  it("RC can submit Draft risks", () => {
    expect(canPerformWorkflowAction("submit", "Draft", "RC")).toBe(true);
  });
  it("RC cannot approve", () => {
    expect(canPerformWorkflowAction("approve", "Submitted", "RC")).toBe(false);
  });
  it("RR can review a Submitted risk", () => {
    expect(canPerformWorkflowAction("review", "Submitted", "RR")).toBe(true);
  });
  it("CRO can approve Under Review risks", () => {
    expect(canPerformWorkflowAction("approve", "Under Review", "CRO")).toBe(true);
  });
  it("submitter can withdraw only while unclaimed", () => {
    expect(
      canPerformWorkflowAction("withdraw", "Submitted", "RC", { isSubmitter: true, hasReviewer: false })
    ).toBe(true);
    expect(
      canPerformWorkflowAction("withdraw", "Submitted", "RC", { isSubmitter: true, hasReviewer: true })
    ).toBe(false);
  });
  it("only ADMIN/CRO/RMD can deescalate an Escalated risk", () => {
    expect(canPerformWorkflowAction("deescalate", "Approved", "CRO", { lifecycleStatus: "Escalated" })).toBe(true);
    expect(canPerformWorkflowAction("deescalate", "Approved", "RR", { lifecycleStatus: "Escalated" })).toBe(false);
    expect(canPerformWorkflowAction("deescalate", "Approved", "CRO", { lifecycleStatus: "New" })).toBe(false);
  });
  it("escalate is blocked once Approved / Mitigated / Crystallized", () => {
    expect(canPerformWorkflowAction("escalate", "Under Review", "CRO", { lifecycleStatus: "New" })).toBe(true);
    expect(canPerformWorkflowAction("escalate", "Approved", "CRO", { lifecycleStatus: "New" })).toBe(false);
    expect(canPerformWorkflowAction("escalate", "Under Review", "CRO", { lifecycleStatus: "Mitigated" })).toBe(false);
    expect(canPerformWorkflowAction("escalate", "Under Review", "CRO", { lifecycleStatus: "Crystallized" })).toBe(false);
  });
  it("no role → never allowed", () => {
    expect(canPerformWorkflowAction("submit", "Draft", undefined)).toBe(false);
  });
});

describe("statusBadgeVariant", () => {
  it("maps key statuses", () => {
    expect(statusBadgeVariant("Approved")).toBe("primary");
    expect(statusBadgeVariant("Mitigated")).toBe("success");
    expect(statusBadgeVariant("Crystallized")).toBe("destructive");
    expect(statusBadgeVariant("Draft")).toBe("outline");
  });
});
