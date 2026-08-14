import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

import autoTable from "jspdf-autotable";
import {
  drawNrsHeader,
  drawNrsFooter,
  drawNrsSectionHeading,
  drawNrsParagraph,
  renderNrsKeyValueTable,
  ensureNrsSpace,
  afterNrsTable,
  drawNrsStatBox,
} from "@/lib/nrsPdf";

function makeDoc(overrides: Partial<any> = {}) {
  return {
    internal: { pageSize: { width: 210, height: 297 } },
    setFillColor: vi.fn(), rect: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(),
    setFontSize: vi.fn(), text: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn(),
    line: vi.fn(), addImage: vi.fn(), roundedRect: vi.fn(),
    splitTextToSize: vi.fn((t: string) => [t]),
    getNumberOfPages: () => 1, setPage: vi.fn(), addPage: vi.fn(),
    ...overrides,
  } as any;
}

describe("nrsPdf helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("draws the branded header with title and subtitle text", () => {
    const doc = makeDoc();
    drawNrsHeader(doc, "data:image/jpeg;base64,xx", "Board Report", "Period: Q1");
    expect(doc.text).toHaveBeenCalledWith("Board Report", 10, 40);
    expect(doc.text).toHaveBeenCalledWith("Period: Q1", 10, 46);
    expect(doc.addImage).toHaveBeenCalled();
  });

  it("skips the logo image when none is provided", () => {
    const doc = makeDoc();
    drawNrsHeader(doc, null, "Title", "Subtitle");
    expect(doc.addImage).not.toHaveBeenCalled();
  });

  it("stamps every page with a footer including page numbers", () => {
    const doc = makeDoc({ getNumberOfPages: () => 2 });
    drawNrsFooter(doc);
    expect(doc.setPage).toHaveBeenCalledWith(1);
    expect(doc.setPage).toHaveBeenCalledWith(2);
    expect(doc.text).toHaveBeenCalledWith("Page 1 of 2", expect.any(Number), expect.any(Number), { align: "right" });
    expect(doc.text).toHaveBeenCalledWith("Page 2 of 2", expect.any(Number), expect.any(Number), { align: "right" });
  });

  it("renders a section heading and advances the cursor", () => {
    const doc = makeDoc();
    const next = drawNrsSectionHeading(doc, 50, "Risk Summary");
    expect(doc.text).toHaveBeenCalledWith("Risk Summary", 10, 50);
    expect(next).toBe(56);
  });

  it("wraps paragraph text and advances the cursor by line count", () => {
    const doc = makeDoc({ splitTextToSize: vi.fn(() => ["line one", "line two"]) });
    const next = drawNrsParagraph(doc, 50, "Some long paragraph");
    expect(next).toBe(50 + 2 * 4 + 4);
  });

  it("renders a key/value table via autoTable with brand styling", () => {
    const doc = makeDoc();
    (doc as any).lastAutoTable = { finalY: 80 };
    const next = renderNrsKeyValueTable(doc, 50, [{ label: "Total", value: 5 }]);
    expect(autoTable).toHaveBeenCalledWith(doc, expect.objectContaining({
      startY: 50,
      head: [["Metric", "Value"]],
      body: [["Total", "5"]],
    }));
    expect(next).toBe(86); // afterNrsTable(finalY + 6)
  });

  it("forces a page break when there isn't enough room left", () => {
    const doc = makeDoc();
    const next = ensureNrsSpace(doc, 275, 20);
    expect(doc.addPage).toHaveBeenCalled();
    expect(next).toBe(52); // HEADER_BOTTOM
  });

  it("does not page-break when there is enough room", () => {
    const doc = makeDoc();
    const next = ensureNrsSpace(doc, 100, 20);
    expect(doc.addPage).not.toHaveBeenCalled();
    expect(next).toBe(100);
  });

  it("falls back to the provided cursor when no autoTable result exists", () => {
    const doc = makeDoc();
    const next = afterNrsTable(doc, 50, 8);
    expect(next).toBe(58);
  });

  it("draws a stat box with a truncated long value", () => {
    const doc = makeDoc();
    drawNrsStatBox(doc, 10, 10, 40, 20, "Total Risks", "This is a very long value string");
    expect(doc.text).toHaveBeenCalledWith("This is a very …", 15, 26);
  });
});
