import { describe, it, expect } from "vitest";
import {
  findNavAccessMismatches,
  findInvariantViolations,
} from "@/lib/navAccessConsistency";

describe("nav ↔ route guard consistency", () => {
  it("has zero invariant violations (CRO ⛔ /user-management, ADMIN sees all)", () => {
    expect(findInvariantViolations()).toEqual([]);
  });

  // Informational: known drift between sidebar visibility and route guards.
  // Currently /risk-matrix guard admits RC/RO/USER but sidebar hides it.
  // Snapshot the current state so any *new* drift fails the test.
  it("sidebar/route mismatches remain within the known baseline", () => {
    const knownPaths = new Set(["/risk-matrix"]);
    const unexpected = findNavAccessMismatches().filter(
      (m) => !knownPaths.has(m.path)
    );
    expect(unexpected).toEqual([]);
  });
});
