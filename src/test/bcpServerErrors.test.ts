import { describe, it, expect } from "vitest";
import { mapBcpServerError } from "@/lib/bcpServerErrors";

describe("mapBcpServerError", () => {
  it("maps a trigger message to a field key", () => {
    const r = mapBcpServerError({
      message: "bia_financial_impact must be between 1 and 5",
    });
    expect(r.fieldErrors.biaFinancialImpact).toMatch(/must be/i);
    expect(r.generalMessage).toBeNull();
  });

  it("returns generalMessage when no known column matches", () => {
    const r = mapBcpServerError({ message: "some unrelated failure" });
    expect(r.fieldErrors).toEqual({});
    expect(r.generalMessage).toBe("some unrelated failure");
  });

  it("handles multiple columns in one message", () => {
    const r = mapBcpServerError({
      message: "bia_criticality_rating invalid; test_type is required",
    });
    expect(Object.keys(r.fieldErrors)).toEqual(
      expect.arrayContaining(["biaCriticalityRating", "testType"])
    );
  });
});
