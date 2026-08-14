import { describe, it, expect } from "vitest";
import { bcpRowsToCSV } from "@/components/bcp/BCPTable";

describe("bcpRowsToCSV", () => {
  it("emits a header row with the expected columns", () => {
    const csv = bcpRowsToCSV([]);
    expect(csv).toBe(
      "Title,Department,Business Function,Criticality,BIA Assessment Date,Status,Test Status,RTO (h),RPO (h),Last Updated"
    );
  });

  it("shapes a data row in the same column order as the header", () => {
    const csv = bcpRowsToCSV([
      {
        title: "Data Center Failover",
        department: "IT",
        business_function: "Infrastructure",
        bia_criticality_rating: "High",
        bia_assessment_date: "2024-01-15",
        status: "Ready",
        test_status: "Passed",
        recovery_time_objective: 4,
        recovery_point_objective: 1,
        last_updated_date: "2024-02-01",
      },
    ]);
    const [header, row] = csv.split("\n");
    expect(header.split(",")).toHaveLength(row.split(",").length);
    expect(row).toBe(
      "Data Center Failover,IT,Infrastructure,High,2024-01-15,Ready,Passed,4,1,2024-02-01"
    );
  });

  it("defaults criticality to Medium when missing", () => {
    const csv = bcpRowsToCSV([{ title: "x", department: "d", business_function: "f" }]);
    const [, row] = csv.split("\n");
    expect(row.split(",")[3]).toBe("Medium");
  });

  it("quotes and escapes fields containing commas, quotes, or newlines", () => {
    const csv = bcpRowsToCSV([
      { title: 'Plan, "Alpha"\nSite', department: "Ops", business_function: "F" },
    ]);
    const [, row] = csv.split("\n").slice(0, 1).concat(csv.split("\n").slice(1).join("\n"));
    expect(csv).toContain('"Plan, ""Alpha""');
  });

  it("renders multiple rows, one CSV line per input row plus the header", () => {
    const csv = bcpRowsToCSV([
      { title: "A", department: "d1", business_function: "f1" },
      { title: "B", department: "d2", business_function: "f2" },
    ]);
    expect(csv.split("\n")).toHaveLength(3);
  });
});
