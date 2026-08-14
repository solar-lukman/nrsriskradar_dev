import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecordedCall } from "@/test/mocks/supabase";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const { calls, fixtures } = vi.hoisted(() => ({
  calls: [] as RecordedCall[],
  fixtures: {
    risks: [] as any[],
    risk_audit_logs: [] as any[],
  },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { supabase: createSupabaseMock(fixtures, { calls }) };
});

import { useBudgetForecast } from "@/hooks/useBudgetForecast";

const callsFor = (table: string) => calls.filter((c) => c.table === table);

describe("useBudgetForecast", () => {
  beforeEach(() => {
    calls.length = 0;
    fixtures.risks = [];
    fixtures.risk_audit_logs = [];
  });

  it("returns empty forecasts when there are no eligible risks", async () => {
    const { result } = renderHook(() => useBudgetForecast());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forecasts).toEqual([]);
    expect(result.current.aggregateForecast).toBeNull();
  });

  it("filters risks by non-null budget and active statuses", async () => {
    renderHook(() => useBudgetForecast());
    await waitFor(() => expect(callsFor("risks").length).toBeGreaterThan(0));
    const risksCalls = callsFor("risks");
    expect(risksCalls.some((c) => c.method === "not" && c.args[0] === "mitigation_budget" && c.args[1] === "is")).toBe(true);
    expect(
      risksCalls.some(
        (c) => c.method === "in" && c.args[0] === "status" && Array.isArray(c.args[1]) && c.args[1].includes("Escalated"),
      ),
    ).toBe(true);
  });

  it("computes a warning severity when a risk is projected to hit 75% within 60 days (from spend-rate history)", async () => {
    // Budget 1000, spent 400 (40%). Two audit logs give a spend rate of 10/day,
    // so remaining-to-75% (350) / 10 = 35 days <= 60 -> warning.
    fixtures.risks = [
      {
        id: "risk-warning",
        title: "Vendor risk",
        mitigation_budget: 1000,
        mitigation_budget_spent: 400,
        status: "New",
        created_at: new Date(NOW - 40 * DAY).toISOString(),
      },
    ];
    fixtures.risk_audit_logs = [
      {
        risk_id: "risk-warning",
        action: "updated",
        performed_at: new Date(NOW - 20 * DAY).toISOString(),
        changes: { after: { mitigation_budget_spent: 200 } },
      },
      {
        risk_id: "risk-warning",
        action: "updated",
        performed_at: new Date(NOW - 10 * DAY).toISOString(),
        changes: { after: { mitigation_budget_spent: 300 } },
      },
    ];

    const { result } = renderHook(() => useBudgetForecast());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const forecast = result.current.forecasts[0];
    expect(forecast.currentUtilization).toBe(40);
    expect(forecast.dailySpendRate).toBe(10);
    expect(forecast.daysTo75Percent).toBe(35);
    expect(forecast.severity).toBe("warning");
  });

  it("computes a critical severity when 90% will be reached within 30 days", async () => {
    // Budget 1000, spent 800 (80%). Spend rate 20/day -> daysTo90 = (900-800)/20 = 5 <= 30 -> critical.
    fixtures.risks = [
      {
        id: "risk-critical",
        title: "Critical vendor risk",
        mitigation_budget: 1000,
        mitigation_budget_spent: 800,
        status: "Escalated",
        created_at: new Date(NOW - 40 * DAY).toISOString(),
      },
    ];
    fixtures.risk_audit_logs = [
      {
        risk_id: "risk-critical",
        action: "updated",
        performed_at: new Date(NOW - 20 * DAY).toISOString(),
        changes: { after: { mitigation_budget_spent: 400 } },
      },
      {
        risk_id: "risk-critical",
        action: "updated",
        performed_at: new Date(NOW - 10 * DAY).toISOString(),
        changes: { after: { mitigation_budget_spent: 600 } },
      },
    ];

    const { result } = renderHook(() => useBudgetForecast());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const forecast = result.current.forecasts[0];
    expect(forecast.currentUtilization).toBe(80);
    expect(forecast.dailySpendRate).toBe(20);
    expect(forecast.daysTo90Percent).toBe(5);
    expect(forecast.severity).toBe("critical");
  });

  it("computes a normal severity when depletion is far away", async () => {
    fixtures.risks = [
      {
        id: "risk-normal",
        title: "Low spend risk",
        mitigation_budget: 10000,
        mitigation_budget_spent: 100,
        status: "New",
        created_at: new Date(NOW - 100 * DAY).toISOString(),
      },
    ];
    fixtures.risk_audit_logs = [];

    const { result } = renderHook(() => useBudgetForecast());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const forecast = result.current.forecasts[0];
    expect(forecast.severity).toBe("normal");
  });

  it("excludes risks with no budget or no spend from forecasts", async () => {
    fixtures.risks = [
      { id: "no-budget", title: "No budget", mitigation_budget: null, mitigation_budget_spent: 0, status: "New", created_at: new Date().toISOString() },
      { id: "no-spend", title: "No spend", mitigation_budget: 500, mitigation_budget_spent: 0, status: "New", created_at: new Date().toISOString() },
    ];
    const { result } = renderHook(() => useBudgetForecast());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forecasts).toEqual([]);
  });

  it("aggregates daily spend rate and counts of at-risk budgets", async () => {
    fixtures.risks = [
      {
        id: "risk-warning",
        title: "Vendor risk",
        mitigation_budget: 1000,
        mitigation_budget_spent: 400,
        status: "New",
        created_at: new Date(NOW - 40 * DAY).toISOString(),
      },
      {
        id: "risk-critical",
        title: "Critical vendor risk",
        mitigation_budget: 1000,
        mitigation_budget_spent: 800,
        status: "Escalated",
        created_at: new Date(NOW - 40 * DAY).toISOString(),
      },
    ];
    fixtures.risk_audit_logs = [
      { risk_id: "risk-warning", action: "updated", performed_at: new Date(NOW - 20 * DAY).toISOString(), changes: { after: { mitigation_budget_spent: 200 } } },
      { risk_id: "risk-warning", action: "updated", performed_at: new Date(NOW - 10 * DAY).toISOString(), changes: { after: { mitigation_budget_spent: 300 } } },
      { risk_id: "risk-critical", action: "updated", performed_at: new Date(NOW - 20 * DAY).toISOString(), changes: { after: { mitigation_budget_spent: 400 } } },
      { risk_id: "risk-critical", action: "updated", performed_at: new Date(NOW - 10 * DAY).toISOString(), changes: { after: { mitigation_budget_spent: 600 } } },
    ];

    const { result } = renderHook(() => useBudgetForecast());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aggregateForecast?.overallDailySpendRate).toBe(30);
    expect(result.current.aggregateForecast?.risksExceeding75Soon).toBe(1);
    expect(result.current.aggregateForecast?.risksExceeding90Soon).toBe(1);
  });
});
