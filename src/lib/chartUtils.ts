/**
 * Shared chart utilities — formatters, palette, severity helpers.
 * Keeps charts consistent across all dashboards.
 */

// Semantic palette (HSL CSS vars). Use in this order for categorical charts.
export const CHART_PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--secondary))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--ring))',
];

export function pickColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

/** Severity color for a risk score (likelihood × impact, 1-25). */
export function severityColor(score: number): string {
  if (score >= 15) return 'hsl(var(--destructive))';
  if (score >= 9) return 'hsl(var(--warning))';
  if (score >= 4) return 'hsl(var(--accent))';
  return 'hsl(var(--success))';
}

export function severityLabel(score: number): 'Critical' | 'High' | 'Medium' | 'Low' {
  if (score >= 15) return 'Critical';
  if (score >= 9) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}

/** Compact number formatter (1.2K, 3.4M). Safe for null/NaN. */
export function formatCompactNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1000) return String(Math.round(n * 10) / 10);
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Currency formatter (defaults to NGN per project standard). */
export function formatCurrency(value: unknown, currency = 'NGN'): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Percentage formatter with safe divide. */
export function formatPercent(numerator: number, denominator: number, digits = 1): string {
  if (!denominator || !Number.isFinite(denominator)) return '0%';
  const pct = (numerator / denominator) * 100;
  return `${pct.toFixed(digits)}%`;
}

/** Truncate long category labels for axis ticks. */
export function truncateLabel(label: string, max = 18): string {
  if (!label) return '';
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
