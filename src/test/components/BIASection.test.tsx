import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BIASection } from "@/components/bcp/BIASection";

function Wrapper(props: Partial<React.ComponentProps<typeof BIASection>> = {}) {
  const [criticalityRating, setCriticalityRating] = React.useState("Medium");
  const [financialImpact, setFinancialImpact] = React.useState("");
  const [operationalImpact, setOperationalImpact] = React.useState("");
  const [reputationalImpact, setReputationalImpact] = React.useState("");
  const [regulatoryImpact, setRegulatoryImpact] = React.useState("");
  const [maxTolerableDowntime, setMaxTolerableDowntime] = React.useState("");
  const [assessmentDate, setAssessmentDate] = React.useState("");
  return (
    <BIASection
      criticalityRating={criticalityRating} setCriticalityRating={setCriticalityRating}
      financialImpact={financialImpact} setFinancialImpact={setFinancialImpact}
      operationalImpact={operationalImpact} setOperationalImpact={setOperationalImpact}
      reputationalImpact={reputationalImpact} setReputationalImpact={setReputationalImpact}
      regulatoryImpact={regulatoryImpact} setRegulatoryImpact={setRegulatoryImpact}
      maxTolerableDowntime={maxTolerableDowntime} setMaxTolerableDowntime={setMaxTolerableDowntime}
      assessmentDate={assessmentDate} setAssessmentDate={setAssessmentDate}
      {...props}
    />
  );
}

describe("BIASection", () => {
  it("is collapsed by default and shows no errors", () => {
    render(<Wrapper />);
    expect(screen.queryByText(/Financial Impact/)).not.toBeInTheDocument();
  });

  it("expands when clicked to reveal fields", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: /Business Impact Assessment/i }));
    expect(screen.getByText(/Financial Impact/)).toBeInTheDocument();
  });

  it("auto-opens and shows validation messages when errors are present", () => {
    render(
      <Wrapper
        errors={{
          biaFinancialImpact: "Financial impact is required",
          biaAssessmentDate: "Date cannot be in the future",
        }}
      />
    );
    expect(screen.getByText(/fix errors below/i)).toBeInTheDocument();
    expect(screen.getByText("Financial impact is required")).toBeInTheDocument();
    expect(screen.getByText("Date cannot be in the future")).toBeInTheDocument();
  });

  it("calls setFinancialImpact when the input changes", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: /Business Impact Assessment/i }));
    const input = screen.getByPlaceholderText("e.g., 5000000");
    await user.type(input, "1000");
    expect(input).toHaveValue(1000);
  });
});
