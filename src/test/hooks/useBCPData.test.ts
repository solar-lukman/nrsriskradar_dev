import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecordedCall } from "@/test/mocks/supabase";

const { calls, fixtures, errors } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  fixtures: {
    business_continuity_plans: [
      { status: "Ready", last_updated_date: "2024-01-01T00:00:00.000Z" },
      { status: "Ready", last_updated_date: "2024-03-01T00:00:00.000Z" },
      { status: "Draft", last_updated_date: "2024-02-01T00:00:00.000Z" },
      { status: "Draft", last_updated_date: "2024-02-15T00:00:00.000Z" },
    ] as any[],
  },
  errors: {} as Record<string, { message: string }>,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock(fixtures, { calls, errors }) };
});

import { useBCPData } from "@/hooks/useBCPData";

const callsFor = (table: string) => calls.filter((c) => c.table === table);

describe("useBCPData", () => {
  beforeEach(() => {
    calls.length = 0;
    delete errors.business_continuity_plans;
  });

  it("computes totals, ready count and coverage percentage", async () => {
    const { result } = renderHook(() => useBCPData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bcpData.totalPlans).toBe(4);
    expect(result.current.bcpData.readyPlans).toBe(2);
    expect(result.current.bcpData.coverage).toBe(50);
    expect(result.current.error).toBeNull();
  });

  it("selects the most recent last_updated_date", async () => {
    const { result } = renderHook(() => useBCPData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bcpData.lastUpdated?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });

  it("queries only status and last_updated_date", async () => {
    const { result } = renderHook(() => useBCPData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const select = callsFor("business_continuity_plans").find((c) => c.method === "select");
    expect(select?.args[0]).toBe("status, last_updated_date");
  });

  it("reports 0 coverage when there are no plans", async () => {
    fixtures.business_continuity_plans = [];
    const { result } = renderHook(() => useBCPData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bcpData.totalPlans).toBe(0);
    expect(result.current.bcpData.coverage).toBe(0);
    expect(result.current.bcpData.lastUpdated).toBeNull();
    fixtures.business_continuity_plans = [
      { status: "Ready", last_updated_date: "2024-01-01T00:00:00.000Z" },
      { status: "Ready", last_updated_date: "2024-03-01T00:00:00.000Z" },
      { status: "Draft", last_updated_date: "2024-02-01T00:00:00.000Z" },
      { status: "Draft", last_updated_date: "2024-02-15T00:00:00.000Z" },
    ];
  });

  it("surfaces errors from the query", async () => {
    errors.business_continuity_plans = { message: "db down" };
    const { result } = renderHook(() => useBCPData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load BCP data");
  });
});
