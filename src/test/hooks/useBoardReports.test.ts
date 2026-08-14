import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const saveMock = vi.fn();
const jsPdfInstance = {
  save: saveMock,
  internal: { pageSize: { width: 210, height: 297 } },
  setFillColor: vi.fn(), rect: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(),
  setFontSize: vi.fn(), text: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn(),
  line: vi.fn(), addImage: vi.fn(), splitTextToSize: vi.fn((t: string) => [t]),
  getNumberOfPages: () => 1, setPage: vi.fn(), addPage: vi.fn(),
};
vi.mock("jspdf", () => ({ default: vi.fn().mockImplementation(function (this: any) { Object.assign(this, jsPdfInstance); }) }));
vi.mock("jspdf-autotable", () => ({ default: vi.fn(() => { (jsPdfInstance as any).lastAutoTable = { finalY: 60 }; }) }));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    supabase: createSupabaseMock({
      risks: [
        { id: "r1", title: "Data breach", category: "Cyber", department: "IT", status: "Escalated", inherent_likelihood: 4, inherent_impact: 5, residual_likelihood: 3, residual_impact: 4, mitigation_budget: 1000, mitigation_budget_spent: 400, risk_type: "institutional", review_date: null, ai_score_status: "completed" },
        { id: "r2", title: "Vendor risk", category: "Operational", department: "Ops", status: "Mitigated", inherent_likelihood: 2, inherent_impact: 2, residual_likelihood: 1, residual_impact: 2, mitigation_budget: 500, mitigation_budget_spent: 500, risk_type: "compliance", review_date: null, ai_score_status: "pending" },
      ],
      business_continuity_plans: [
        { id: "b1", title: "DR Plan", department: "IT", status: "Ready", test_status: "Passed", recovery_time_objective: 4, recovery_point_objective: 2 },
      ],
      risk_controls: [
        { id: "c1", risk_id: "r1", status: "active", effectiveness_rating: "high" },
      ],
    }),
  };
});

globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

import { useBoardReports } from "@/hooks/useBoardReports";

describe("useBoardReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a quarterly report with the expected sections", async () => {
    const { result } = renderHook(() => useBoardReports());
    await act(async () => {
      await result.current.generateReport("quarterly", "Quarterly Risk Assessment", "Q1 2024");
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const titles = result.current.sections.map((s) => s.title);
    expect(titles).toContain("Executive Summary");
    expect(titles).toContain("Risk Distribution by Category");
    expect(result.current.activeReport).toEqual({ title: "Quarterly Risk Assessment", period: "Q1 2024" });
  });

  it("generates an emergency report highlighting escalated risks and BCP readiness", async () => {
    const { result } = renderHook(() => useBoardReports());
    await act(async () => {
      await result.current.generateReport("emergency", "Emergency Report", "Now");
    });
    const summary = result.current.sections.find((s) => s.title === "Emergency Readiness Overview");
    expect(summary?.data).toEqual(
      expect.arrayContaining([{ label: "Total BCPs", value: 1 }]),
    );
    const escalatedSection = result.current.sections.find((s) => s.title === "Escalated Risks Requiring Attention");
    expect(escalatedSection?.data?.[0].label).toBe("Data breach");
  });

  it("falls back to an error section when report generation throws", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase.from as any) = vi.fn(() => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useBoardReports());
    await act(async () => {
      await result.current.generateReport("quarterly", "Quarterly", "Q1");
    });
    expect(result.current.sections).toEqual([
      { title: "Error", content: "Failed to generate report. Please try again." },
    ]);
  });

  it("builds a PDF with a section per report entry and saves it", async () => {
    const { result } = renderHook(() => useBoardReports());
    await act(async () => {
      await result.current.downloadPDF("Quarterly Risk Assessment", "Q1 2024", [
        { title: "Executive Summary", content: "Overview", data: [{ label: "Total", value: 5 }] },
      ]);
    });
    expect(saveMock).toHaveBeenCalledWith(expect.stringContaining("NRS-Quarterly-Risk-Assessment"));
    expect(jsPdfInstance.text).toHaveBeenCalled();
  });
});
