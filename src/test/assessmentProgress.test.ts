import { describe, it, expect } from "vitest";
import {
  deriveAssessmentProgress,
  progressLabel,
  progressBadgeVariant,
} from "@/lib/assessmentProgress";

describe("deriveAssessmentProgress", () => {
  it("returns draft when no assessments and status is Draft", () => {
    expect(deriveAssessmentProgress({ approval_status: "Draft", assessment_count: 0 })).toBe("draft");
  });

  it("returns completed when Approved with assessments", () => {
    expect(
      deriveAssessmentProgress({ approval_status: "Approved", assessment_count: 1, status: "New" })
    ).toBe("completed");
  });

  it("returns completed when Approved and status is Mitigated", () => {
    expect(
      deriveAssessmentProgress({ approval_status: "Approved", assessment_count: 0, status: "Mitigated" })
    ).toBe("completed");
  });

  it("returns in_review for Submitted approval status", () => {
    expect(deriveAssessmentProgress({ approval_status: "Submitted", assessment_count: 0 })).toBe(
      "in_review"
    );
  });

  it("returns in_review when at least one assessment exists", () => {
    expect(deriveAssessmentProgress({ approval_status: "Draft", assessment_count: 2 })).toBe(
      "in_review"
    );
  });
});

describe("progressLabel / progressBadgeVariant", () => {
  it("labels each stage", () => {
    expect(progressLabel("draft")).toBe("Draft");
    expect(progressLabel("in_review")).toBe("In Review");
    expect(progressLabel("completed")).toBe("Completed");
  });
  it("maps to badge variants", () => {
    expect(progressBadgeVariant("draft")).toBe("secondary");
    expect(progressBadgeVariant("in_review")).toBe("warning");
    expect(progressBadgeVariant("completed")).toBe("success");
  });
});
