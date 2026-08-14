import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import type { RecordedCall } from "@/test/mocks/supabase";
import { AuthContext } from "@/contexts/AuthContext";
import { makeAuthValue } from "@/test/renderWithProviders";

const { calls } = vi.hoisted(() => ({ calls: [] as RecordedCall[] }));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    supabase: createSupabaseMock(
      {
        risks: Array.from({ length: 3 }).map((_, i) => ({ id: `r${i}` })),
        business_continuity_plans: Array.from({ length: 2 }).map((_, i) => ({ id: `b${i}` })),
        risk_events: Array.from({ length: 5 }).map((_, i) => ({ id: `e${i}` })),
        board_report_archives: Array.from({ length: 1 }).map((_, i) => ({ id: `rep${i}` })),
        profiles: Array.from({ length: 7 }).map((_, i) => ({ id: `p${i}` })),
      },
      { calls },
    ),
  };
});

import { useSidebarCounts } from "@/hooks/useSidebarCounts";

function wrapperFor(role: "ADMIN" | null) {
  const authValue = makeAuthValue(role);
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthContext.Provider, { value: authValue }, children);
}

const callsFor = (table: string) => calls.filter((c) => c.table === table);

describe("useSidebarCounts", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("returns the EMPTY count state when there is no user", async () => {
    const { result } = renderHook(() => useSidebarCounts(), { wrapper: wrapperFor(null) });
    await waitFor(() => expect(result.current.risks).toBe(0));
    expect(result.current).toEqual({
      risks: 0,
      bcps: 0,
      incidents: 0,
      reports: 0,
      calendarUpcoming: 0,
      whistleblow: 0,
      users: 0,
    });
    expect(calls.length).toBe(0);
  });

  it("aggregates head counts from each table for an authenticated user", async () => {
    const { result } = renderHook(() => useSidebarCounts(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(result.current.risks).toBe(3));
    expect(result.current.bcps).toBe(2);
    expect(result.current.incidents).toBe(5);
    expect(result.current.reports).toBe(1);
    expect(result.current.calendarUpcoming).toBe(3); // reuses risks fixture via a second risks query
    expect(result.current.users).toBe(7);
    expect(result.current.whistleblow).toBe(0);
  });

  it("uses head:true count queries and filters the upcoming-review query by date range", async () => {
    renderHook(() => useSidebarCounts(), { wrapper: wrapperFor("ADMIN") });
    await waitFor(() => expect(callsFor("risks").length).toBeGreaterThan(0));
    const risksSelects = callsFor("risks").filter((c) => c.method === "select");
    expect(risksSelects.some((c) => c.args[1]?.count === "exact" && c.args[1]?.head === true)).toBe(true);
    expect(callsFor("risks").some((c) => c.method === "gte" && c.args[0] === "review_date")).toBe(true);
    expect(callsFor("risks").some((c) => c.method === "lte" && c.args[0] === "review_date")).toBe(true);
  });
});
