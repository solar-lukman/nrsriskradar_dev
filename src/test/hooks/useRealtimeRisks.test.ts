import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecordedCall } from "@/test/mocks/supabase";

const { calls, errors, fixtures, channelSpies } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  errors: {} as Record<string, { message: string }>,
  fixtures: {} as Record<string, any[]>,
  channelSpies: { removeChannelSpy: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  const mock = createSupabaseMock(fixtures, { calls, errors });
  return {
    supabase: {
      ...mock,
      channel: () => {
        const ch: any = { on: () => ch, subscribe: () => ch };
        return ch;
      },
      removeChannel: (ch: any) => {
        channelSpies.removeChannelSpy(ch);
        return Promise.resolve("ok");
      },
    },
  };
});

import { useRealtimeRisks } from "@/hooks/useRealtimeRisks";

const risk = (overrides: any = {}) => ({
  id: "r1",
  title: "Data breach",
  department: "IT",
  owner_id: "o1",
  status: "New",
  residual_likelihood: 5,
  residual_impact: 4,
  inherent_likelihood: 5,
  inherent_impact: 5,
  review_date: null,
  created_at: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

describe("useRealtimeRisks", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(errors)) delete errors[k];
    for (const k of Object.keys(fixtures)) delete fixtures[k];
    channelSpies.removeChannelSpy.mockClear();
  });

  it("fetches risks and orders by created_at descending", async () => {
    fixtures["risks"] = [risk()];
    const { result } = renderHook(() => useRealtimeRisks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.risks).toHaveLength(1);
    expect(
      calls.some((c) => c.table === "risks" && c.method === "order" && c.args[1]?.ascending === false),
    ).toBe(true);
  });

  it("surfaces query errors", async () => {
    errors["risks"] = { message: "boom" };
    const { result } = renderHook(() => useRealtimeRisks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load risks data");
    expect(result.current.risks).toEqual([]);
  });

  it("computes severity client-side from residual (fallback inherent) score", async () => {
    fixtures["risks"] = [
      risk({ id: "high", residual_likelihood: 5, residual_impact: 4 }), // 20 -> high
      risk({ id: "medium", residual_likelihood: 2, residual_impact: 5 }), // 10 -> medium
      risk({ id: "low", residual_likelihood: 1, residual_impact: 2 }), // 2 -> low
    ];
    const { result } = renderHook(() => useRealtimeRisks({ filters: { severity: "high" } }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.risks.map((r: any) => r.id)).toEqual(["high"]);
  });

  it("filters overdue risks by review_date in the past", async () => {
    fixtures["risks"] = [
      risk({ id: "overdue", review_date: "2000-01-01" }),
      risk({ id: "future", review_date: "2999-01-01" }),
      risk({ id: "none", review_date: null }),
    ];
    const { result } = renderHook(() => useRealtimeRisks({ filters: { overdue: true } }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.risks.map((r: any) => r.id)).toEqual(["overdue"]);
  });

  it("refetch re-queries and subscribes/unsubscribes a realtime channel", async () => {
    fixtures["risks"] = [risk()];
    const { result, unmount } = renderHook(() => useRealtimeRisks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = calls.filter((c) => c.table === "risks" && c.method === "select").length;
    await result.current.refetch();
    expect(calls.filter((c) => c.table === "risks" && c.method === "select").length).toBe(before + 1);

    unmount();
    expect(channelSpies.removeChannelSpy).toHaveBeenCalled();
  });
});
