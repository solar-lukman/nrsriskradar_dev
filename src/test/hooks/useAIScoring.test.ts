import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { RecordedCall } from "@/test/mocks/supabase";

const { calls, errors, fixtures, sessionState, invokeResult } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  errors: {} as Record<string, { message: string }>,
  fixtures: {} as Record<string, any[]>,
  sessionState: { session: { access_token: "token" } as any },
  invokeResult: { data: null as any, error: null as any },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  const mock = createSupabaseMock(fixtures, { calls, errors });
  return {
    supabase: {
      ...mock,
      auth: { ...mock.auth, getSession: async () => ({ data: { session: sessionState.session }, error: null }) },
      functions: {
        invoke: async (name: string, payload?: any) => {
          calls.push({ table: `fn:${name}`, method: "invoke", args: [payload] });
          return invokeResult;
        },
      },
    },
  };
});

import { useAIScoring } from "@/hooks/useAIScoring";

const pendingRisk = (overrides: any = {}) => ({
  id: "r1",
  title: "Data breach",
  category: "Cyber",
  residual_likelihood: 3,
  residual_impact: 4,
  ai_recommended_likelihood: 4,
  ai_recommended_impact: 5,
  ai_score_reasoning: "reasoning",
  ai_confidence: 0.9,
  ai_score_generated_at: "2024-01-01T00:00:00.000Z",
  ai_score_status: "pending",
  ...overrides,
});

describe("useAIScoring", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(errors)) delete errors[k];
    for (const k of Object.keys(fixtures)) delete fixtures[k];
    sessionState.session = { access_token: "token" };
    invokeResult.data = null;
    invokeResult.error = null;
  });

  it("fetches risks pending AI scoring on mount", async () => {
    fixtures["risks"] = [pendingRisk()];
    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.risksWithPendingScores).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("swallows fetch errors and returns an empty list instead of crashing", async () => {
    errors["risks"] = { message: "column missing" };
    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.risksWithPendingScores).toEqual([]);
    // The hook intentionally does not surface this as `error` (see source comment).
    expect(result.current.error).toBeNull();
  });

  it("analyzeRiskScores invokes the edge function and refreshes on success", async () => {
    fixtures["risks"] = [pendingRisk()];
    invokeResult.data = { success: true, analyzedCount: 1, results: [{ riskId: "r1" }] };

    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: any;
    await act(async () => {
      returned = await result.current.analyzeRiskScores("r1");
    });

    expect(returned).toEqual([{ riskId: "r1" }]);
    expect(calls.some((c) => c.table === "fn:risk-scoring-engine")).toBe(true);
  });

  it("analyzeRiskScores surfaces an error when not logged in", async () => {
    sessionState.session = null;
    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: any;
    await act(async () => {
      returned = await result.current.analyzeRiskScores();
    });
    expect(returned).toBeNull();
    expect(result.current.error).toContain("logged in");
  });

  it("analyzeRiskScores surfaces edge function failure results", async () => {
    invokeResult.data = { success: false, error: "model unavailable" };
    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: any;
    await act(async () => {
      returned = await result.current.analyzeRiskScores();
    });
    expect(returned).toBeNull();
    expect(result.current.error).toBe("model unavailable");
  });

  it("applyRecommendation updates the risk and removes it from the pending list", async () => {
    fixtures["risks"] = [pendingRisk()];
    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.risksWithPendingScores).toHaveLength(1));

    // Simulate the refetch after apply returning no more pending risks.
    fixtures["risks"] = [];
    await act(async () => {
      await result.current.applyRecommendation("r1");
    });
    expect(calls.some((c) => c.table === "risks" && c.method === "update")).toBe(true);
    expect(result.current.risksWithPendingScores).toEqual([]);
  });

  it("dismissRecommendation marks the risk dismissed", async () => {
    fixtures["risks"] = [pendingRisk()];
    const { result } = renderHook(() => useAIScoring());
    await waitFor(() => expect(result.current.risksWithPendingScores).toHaveLength(1));

    await act(async () => {
      await result.current.dismissRecommendation("r1");
    });
    expect(calls.some((c) => c.table === "risks" && c.method === "update")).toBe(true);
  });
});
