import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));
vi.mock("@/lib/nrsPdf", async () => {
  const actual = await vi.importActual<any>("@/lib/nrsPdf");
  return { ...actual, loadNrsLogo: vi.fn().mockResolvedValue(null) };
});

const saveMock = vi.fn();
vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    Object.assign(this, {
      save: saveMock,
      internal: { pageSize: { width: 210, height: 297 } },
      setFillColor: vi.fn(), rect: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(),
      setFontSize: vi.fn(), text: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn(),
      line: vi.fn(), addImage: vi.fn(), circle: vi.fn(),
      splitTextToSize: vi.fn((t: string) => [t]),
      getNumberOfPages: () => 1, setPage: vi.fn(), addPage: vi.fn(),
      lastAutoTable: { finalY: 100 },
    });
  }),
}));

import autoTable from "jspdf-autotable";
import { exportDocPageToPdf } from "@/lib/docPdf";

const page = {
  slug: "risk-register",
  title: "Risk Register Guide",
  group: "Risk Owner",
  description: "How to use the risk register.",
  content: [
    "# Overview",
    "",
    "## Getting Started",
    "",
    "- Step one",
    "- Step two",
    "",
    "| Field | Required |",
    "| --- | --- |",
    "| Title | Yes |",
  ].join("\n"),
} as any;

describe("docPdf.exportDocPageToPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a PDF named after the page slug", async () => {
    await exportDocPageToPdf(page);
    expect(saveMock).toHaveBeenCalledWith("NRS-RMP-risk-register.pdf");
  });

  it("renders markdown tables through autoTable", async () => {
    await exportDocPageToPdf(page);
    expect(autoTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        head: [["Field", "Required"]],
        body: [["Title", "Yes"]],
      }),
    );
  });

  it("sanitizes the slug for the output filename", async () => {
    await exportDocPageToPdf({ ...page, slug: "weird slug/name!" });
    expect(saveMock).toHaveBeenCalledWith("NRS-RMP-weird-slug-name-.pdf");
  });
});
