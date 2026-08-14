import { describe, it, expect } from "vitest";
import {
  severityColor,
  severityLabel,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  truncateLabel,
  pickColor,
  CHART_PALETTE,
} from "@/lib/chartUtils";

describe("severity thresholds (ISO 31000 scoring, 1-25)", () => {
  it("treats a score of 15 or more as Critical", () => {
    expect(severityLabel(15)).toBe("Critical");
    expect(severityLabel(25)).toBe("Critical");
    expect(severityColor(15)).toBe("hsl(var(--destructive))");
  });

  it("bands 9-14 as High, 4-8 as Medium, below 4 as Low", () => {
    expect(severityLabel(14)).toBe("High");
    expect(severityLabel(9)).toBe("High");
    expect(severityLabel(8)).toBe("Medium");
    expect(severityLabel(4)).toBe("Medium");
    expect(severityLabel(3)).toBe("Low");
    expect(severityLabel(1)).toBe("Low");
  });

  it("assigns a distinct colour to each band", () => {
    const colours = new Set([severityColor(1), severityColor(5), severityColor(10), severityColor(20)]);
    expect(colours.size).toBe(4);
  });
});

describe("formatters", () => {
  it("formats currency in Naira by default", () => {
    const out = formatCurrency(1500000);
    expect(out).toMatch(/1,500,000/);
    expect(out.replace(/\u00a0/g, " ")).toMatch(/₦|NGN/);
  });

  it("returns an em dash for non-numeric input", () => {
    expect(formatCurrency("abc")).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCompactNumber(undefined)).toBe("—");
    expect(formatCompactNumber("n/a")).toBe("—");
  });


  it("compacts large numbers", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1200)).toBe("1.2K");
    expect(formatCompactNumber(3_400_000)).toBe("3.4M");
  });

  it("divides safely when computing percentages", () => {
    expect(formatPercent(5, 0)).toBe("0%");
    expect(formatPercent(1, 4)).toBe("25.0%");
    expect(formatPercent(1, 3, 0)).toBe("33%");
  });

  it("truncates long axis labels with an ellipsis", () => {
    expect(truncateLabel("Short")).toBe("Short");
    expect(truncateLabel("A very long category name indeed", 10)).toBe("A very lo…");
    expect(truncateLabel("")).toBe("");
  });
});

describe("chart palette", () => {
  it("cycles colours without running out", () => {
    expect(pickColor(0)).toBe(CHART_PALETTE[0]);
    expect(pickColor(CHART_PALETTE.length)).toBe(CHART_PALETTE[0]);
    expect(pickColor(CHART_PALETTE.length + 2)).toBe(CHART_PALETTE[2]);
  });

  it("uses semantic HSL tokens only (no hardcoded hex)", () => {
    for (const colour of CHART_PALETTE) {
      expect(colour).toMatch(/^hsl\(var\(--/);
    }
  });
});
