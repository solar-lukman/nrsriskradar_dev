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
      auth: {
        ...mock.auth,
        getSession: async () => ({ data: { session: sessionState.session }, error: null }),
        getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
      },
      functions: {
        invoke: async (name: string, payload?: any) => {
          calls.push({ table: `fn:${name}`, method: "invoke", args: [payload] });
          return invokeResult;
        },
      },
    },
  };
});

import { useAIPredictions } from "@/hooks/useAIPredictions";

const prediction = (overrides: any = {}) => ({
  id: "p1",
  prediction_type: "emerging_risk",
  category: "Cyber",
  title: "New threat",
  description: "desc",
  confidence_score: 0.8,
  risk_factors: "not-an-array", // exercises the array-coercion branch
  recommended_actions: ["Patch"],
  data_sources: ["logs"],
  generated_at: "2024-01-01T00:00:00.000Z",
  expires_at: "2099-01-01T00:00:00.000Z",
  status: "active",
  acknowledged_by: null,
  acknowledged_at: null,
  converted_risk_id: null,
  metadata: "not-an-object",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

describe("useAIPredictions", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(errors)) delete errors[k];
    for (const k of Object.keys(fixtures)) delete fixtures[k];
    sessionState.session = { access_token: "token" };
    invokeResult.data = null;
    invokeResult.error = null;
  });

  it("fetches predictions and normalizes non-array/object fields", async () => {
    fixtures["ai_predictions"] = [prediction()];
    const { result } = renderHook(() => useAIPredictions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.predictions).toHaveLength(1);
    expect(result.current.predictions[0].risk_factors).toEqual([]);
    expect(result.current.predictions[0].metadata).toEqual({});
  });

  it("sets an empty list on fetch error without throwing", async () => {
    errors["ai_predictions"] = { message: "boom" };
    const { result } = renderHook(() => useAIPredictions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.predictions).toEqual([]);
  });

  it("generateNewAnalysis requires an active session", async () => {
    sessionState.session = null;
    const { result } = renderHook(() => useAIPredictions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: any;
    await act(async () => {
      returned = await result.current.generateNewAnalysis();
    });
    expect(returned).toBeNull();
    expect(result.current.error).toContain("logged in");
  });

  it("generateNewAnalysis returns the response and refreshes on success", async () => {
    invokeResult.data = {
      success: true,
      predictions: [prediction()],
      analysis_summary: "summary",
      context: { total_risks_analyzed: 5, categories_covered: 2, generated_at: "2024-01-01" },
    };
    const { result } = renderHook(() => useAIPredictions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: any;
    await act(async () => {
      returned = await result.current.generateNewAnalysis();
    });
    expect(returned?.success).toBe(true);
    expect(calls.some((c) => c.table === "fn:risk-ai-analysis")).toBe(true);
  });

  it("generateNewAnalysis surfaces failure error messages", async () => {
    invokeResult.data = { success: false, error: "no credits", code: "PAYMENT_REQUIRED" };
    const { result } = renderHook(() => useAIPredictions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: any;
    await act(async () => {
      returned = await result.current.generateNewAnalysis();
    });
    expect(returned).toBeNull();
    expect(result.current.error).toBe("no credits");
  });

  it("acknowledgePrediction and dismissPrediction update status and refetch", async () => {
    fixtures["ai_predictions"] = [prediction()];
    const { result } = renderHook(() => useAIPredictions());
    await waitFor(() => expect(result.current.predictions).toHaveLength(1));

    await act(async () => {
      await result.current.acknowledgePrediction("p1");
    });
    expect(calls.some((c) => c.table === "ai_predictions" && c.method === "update")).toBe(true);

    await act(async () => {
      await result.current.dismissPrediction("p1");
    });
    expect(
      calls.filter((c) => c.table === "ai_predictions" && c.method === "update").length,
    ).toBeGreaterThanOrEqual(2);
  });
});
