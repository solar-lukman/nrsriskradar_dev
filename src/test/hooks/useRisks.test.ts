import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import type { RecordedCall } from "@/test/mocks/supabase";
import { AuthContext } from "@/contexts/AuthContext";
import { makeAuthValue } from "@/test/renderWithProviders";

const { calls, errors } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  errors: {} as Record<string, { message: string }>,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    supabase: createSupabaseMock(
      {
        risks: [
          {
            id: "r1",
            title: "Data breach",
            description: "desc",
            department: "IT",
            category: "Cyber",
            risk_type: "institutional",
            inherent_likelihood: 4,
            inherent_impact: 5,
            residual_likelihood: 2,
            residual_impact: 3,
            status: "Open",
            review_date: null,
            updated_at: "2024-01-01T00:00:00.000Z",
            mitigation_actions: ["Patch systems", { description: "Rotate keys" }],
            owner: { full_name: "Alice" },
            assigned_to: null,
            created_by_profile: null,
            treatment_strategy: "Mitigate",
            strategic_objective: null,
            review_frequency: "Quarterly",
            flagged_for_audit: true,
            approval_status: "Approved",
            submitted_by: "u1",
            created_by: "u1",
            current_reviewer_id: null,
          },
        ],
      },
      { calls, errors },
    ),
  };
});

import { useRisks } from "@/hooks/useRisks";

const callsFor = (table: string) => calls.filter((c) => c.table === table);

function wrapperFor(role: "ADMIN" | null) {
  const authValue = makeAuthValue(role);
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthContext.Provider, { value: authValue }, children);
}

describe("useRisks", () => {
  beforeEach(() => {
    calls.length = 0;
    delete errors.risks;
  });

  it("returns empty risks and stops loading when there is no user", async () => {
    const { result } = renderHook(() => useRisks(), { wrapper: wrapperFor(null) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.risks).toEqual([]);
    expect(callsFor("risks").length).toBe(0);
  });

  it("fetches and transforms risks for an authenticated user", async () => {
    const { result } = renderHook(() => useRisks(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.risks).toHaveLength(1);
    const risk = result.current.risks[0];
    expect(risk.owner).toBe("Alice");
    expect(risk.department).toBe("IT");
    expect(risk.mitigationActions).toEqual(["Patch systems", "Rotate keys"]);
    expect(risk.flaggedForAudit).toBe(true);
    expect(risk.approvalStatus).toBe("Approved");
  });

  it("orders by created_at descending", async () => {
    const { result } = renderHook(() => useRisks(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      callsFor("risks").some(
        (c) => c.method === "order" && c.args[0] === "created_at" && c.args[1]?.ascending === false,
      ),
    ).toBe(true);
  });

  it("refetch re-queries the risks table", async () => {
    const { result } = renderHook(() => useRisks(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = callsFor("risks").filter((c) => c.method === "select").length;
    await result.current.refetch();
    expect(callsFor("risks").filter((c) => c.method === "select").length).toBe(before + 1);
  });

  it("surfaces query errors", async () => {
    errors.risks = { message: "boom" };
    const { result } = renderHook(() => useRisks(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.risks).toEqual([]);
  });
});
