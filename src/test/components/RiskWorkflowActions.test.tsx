import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/lib/riskWorkflow", async () => {
  const actual = await vi.importActual<any>("@/lib/riskWorkflow");
  return {
    ...actual,
    applyRiskWorkflowTransition: vi.fn(),
  };
});

import { RiskWorkflowActions } from "@/components/risk-register/RiskWorkflowActions";
import { applyRiskWorkflowTransition } from "@/lib/riskWorkflow";

describe("RiskWorkflowActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the submit action for a submitter with a Draft risk", () => {
    renderWithProviders(
      <RiskWorkflowActions riskId="r1" status="Draft" approvalStatus="Draft" createdBy="user-rc" variant="buttons" />,
      { role: "RC" }
    );
    expect(screen.getByRole("button", { name: /Submit for Review/i })).toBeInTheDocument();
  });

  it("renders nothing when the role has no available actions", () => {
    const { container } = renderWithProviders(
      <RiskWorkflowActions riskId="r1" status="Mitigated" approvalStatus="Approved" createdBy="someone-else" variant="buttons" />,
      { role: "RC" }
    );
    expect(container.firstChild).toBeNull();
  });

  it("requires a minimum-length reason before confirming an approve action", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWorkflowActions riskId="r1" status="Submitted" approvalStatus="Submitted" createdBy="user-rc" variant="buttons" />,
      { role: "RR" }
    );
    await user.click(screen.getByRole("button", { name: /Claim for Review/i }));
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("disables confirm until a sufficiently long reason is provided for approve", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWorkflowActions riskId="r1" status="In Review" approvalStatus="Under Review" createdBy="user-rc" currentReviewerId="user-rr" variant="buttons" />,
      { role: "RR" }
    );
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
    expect(confirmBtn).toBeDisabled();

    const textarea = screen.getByPlaceholderText(/Approval note/i);
    await user.type(textarea, "abc");
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/at least 5 characters/i)).toBeInTheDocument();

    await user.type(textarea, "defgh");
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls applyRiskWorkflowTransition with the reason on confirm", async () => {
    (applyRiskWorkflowTransition as any).mockResolvedValue({ approvalStatus: "Approved" });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <RiskWorkflowActions
        riskId="r1" status="In Review" approvalStatus="Under Review" createdBy="user-rc"
        currentReviewerId="user-rr" onChanged={onChanged} variant="buttons"
      />,
      { role: "RR" }
    );
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    await user.type(screen.getByPlaceholderText(/Approval note/i), "Looks good to me");
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(applyRiskWorkflowTransition).toHaveBeenCalledWith({
      riskId: "r1",
      action: "approve",
      reason: "Looks good to me",
    });
  });
});
