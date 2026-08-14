import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestDetailsSection } from "@/components/bcp/TestDetailsSection";

function Wrapper(props: Partial<React.ComponentProps<typeof TestDetailsSection>> = {}) {
  const [testType, setTestType] = React.useState("");
  const [testScope, setTestScope] = React.useState("");
  const [testResults, setTestResults] = React.useState("");
  const [testFindings, setTestFindings] = React.useState<any[]>([]);
  return (
    <TestDetailsSection
      testType={testType} setTestType={setTestType}
      testScope={testScope} setTestScope={setTestScope}
      testResults={testResults} setTestResults={setTestResults}
      testFindings={testFindings} setTestFindings={setTestFindings}
      {...props}
    />
  );
}

describe("TestDetailsSection", () => {
  it("auto-opens and shows validation messages when errors are present", () => {
    render(
      <Wrapper errors={{ testType: "Test type is required", testScope: "Scope is required" }} />
    );
    expect(screen.getByText(/fix errors below/i)).toBeInTheDocument();
    expect(screen.getByText("Test type is required")).toBeInTheDocument();
    expect(screen.getByText("Scope is required")).toBeInTheDocument();
  });

  it("adds and removes findings", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: /Test Details/i }));
    await user.click(screen.getByRole("button", { name: /Add Finding/i }));
    expect(screen.getByText("Finding 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Finding description")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "" })); // the X remove button (no accessible name)
    expect(screen.queryByText("Finding 1")).not.toBeInTheDocument();
  });

  it("updates the scope input value", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: /Test Details/i }));
    const input = screen.getByPlaceholderText("Scope of the test exercise");
    await user.type(input, "Payments team");
    expect(input).toHaveValue("Payments team");
  });
});
