import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecordedCall } from "@/test/mocks/supabase";

const { calls } = vi.hoisted(() => ({ calls: [] as RecordedCall[] }));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    supabase: createSupabaseMock(
      {
        risk_categories: [
          { id: "1", name: "Cyber", description: null, color: null, display_order: 1, is_active: true, risk_type: "institutional" },
          { id: "2", name: "Fraud", description: null, color: null, display_order: 2, is_active: true, risk_type: "compliance" },
        ],
        departments: [
          { id: "d1", name: "Finance", is_active: true },
          { id: "d2", name: "Operations", is_active: true },
        ],
      },
      { calls },
    ),
  };
});


import { useRiskCategories } from "@/hooks/useRiskCategories";
import { useDepartments } from "@/hooks/useDepartments";

const callsFor = (table: string) => calls.filter((c) => c.table === table);

describe("useRiskCategories", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("loads categories from the risk_categories table", async () => {
    const { result } = renderHook(() => useRiskCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories.map((c) => c.name)).toEqual(["Cyber", "Fraud"]);
    expect(result.current.error).toBeNull();
  });

  it("filters to active rows by default and orders by display_order", async () => {
    const { result } = renderHook(() => useRiskCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const table = callsFor("risk_categories");
    expect(table.some((c) => c.method === "eq" && c.args[0] === "is_active" && c.args[1] === true)).toBe(true);
    expect(table.some((c) => c.method === "order" && c.args[0] === "display_order")).toBe(true);
  });

  it("applies the risk_type filter when supplied", async () => {
    const { result } = renderHook(() => useRiskCategories({ riskType: "compliance" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      callsFor("risk_categories").some((c) => c.method === "eq" && c.args[0] === "risk_type" && c.args[1] === "compliance"),
    ).toBe(true);
  });

  it("omits the active filter when activeOnly is false", async () => {
    const { result } = renderHook(() => useRiskCategories({ activeOnly: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(callsFor("risk_categories").some((c) => c.method === "eq" && c.args[0] === "is_active")).toBe(false);
  });

  it("exposes a refetch that re-queries", async () => {
    const { result } = renderHook(() => useRiskCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = callsFor("risk_categories").filter((c) => c.method === "select").length;
    await result.current.refetch();
    expect(callsFor("risk_categories").filter((c) => c.method === "select").length).toBe(before + 1);
  });
});

describe("useDepartments", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("loads active departments ordered by name", async () => {
    const { result } = renderHook(() => useDepartments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.departments.map((d) => d.name)).toEqual(["Finance", "Operations"]);
    const table = callsFor("departments");
    expect(table.some((c) => c.method === "order" && c.args[0] === "name")).toBe(true);
    expect(table.some((c) => c.method === "eq" && c.args[0] === "is_active")).toBe(true);
  });

  it("includes inactive departments when asked", async () => {
    const { result } = renderHook(() => useDepartments(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(callsFor("departments").some((c) => c.method === "eq" && c.args[0] === "is_active")).toBe(false);
  });
});
