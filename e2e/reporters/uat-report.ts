import type {
  Reporter, FullConfig, Suite, TestCase, TestResult,
} from '@playwright/test/reporter';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Custom reporter that maps Playwright results back to UAT case IDs in
 * docs/uat-test-plan.md and writes a Markdown execution report plus a JSON
 * summary. Any test that annotates itself with `{ type: 'uat', description: 'UAT-…-nn' }`
 * is grouped under that case; unannotated tests fall under "Uncategorised".
 */
interface Row {
  uatId: string;
  title: string;
  role: string;
  status: TestResult['status'];
  durationMs: number;
  errors: string[];
  attachments: string[];
}

export default class UatReporter implements Reporter {
  private rows: Row[] = [];
  private outDir = path.resolve('e2e/report');

  onBegin(_config: FullConfig, _suite: Suite) {
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const uatAnn = test.annotations.find((a) => a.type === 'uat');
    const roleAnn = test.annotations.find((a) => a.type === 'role');
    const uatId = uatAnn?.description || 'Uncategorised';
    const attachments = result.attachments
      .filter((a) => a.path)
      .map((a) => path.relative(this.outDir, a.path!));
    this.rows.push({
      uatId,
      title: test.title,
      role: roleAnn?.description || '—',
      status: result.status,
      durationMs: result.duration,
      errors: result.errors.map((e) => (e.message || '').slice(0, 500)),
      attachments,
    });
  }

  async onEnd() {
    const byId = new Map<string, Row[]>();
    for (const r of this.rows) {
      const list = byId.get(r.uatId) || [];
      list.push(r);
      byId.set(r.uatId, list);
    }
    const total = this.rows.length;
    const passed = this.rows.filter((r) => r.status === 'passed').length;
    const failed = this.rows.filter((r) => r.status === 'failed' || r.status === 'timedOut').length;
    const skipped = this.rows.filter((r) => r.status === 'skipped').length;

    const md: string[] = [];
    md.push('# RiskRadar — Automated UAT Execution Report');
    md.push('');
    md.push(`_Generated ${new Date().toISOString()}_`);
    md.push('');
    md.push('Mapped to test cases in `docs/uat-test-plan.md`.');
    md.push('');
    md.push('## Summary');
    md.push('');
    md.push(`| Total | Passed | Failed | Skipped |`);
    md.push(`|------:|-------:|-------:|--------:|`);
    md.push(`| ${total} | ${passed} | ${failed} | ${skipped} |`);
    md.push('');
    md.push('## Results by UAT case');
    md.push('');
    md.push('| UAT ID | Role | Test | Status | Duration (ms) | Evidence |');
    md.push('|--------|------|------|:------:|--------------:|----------|');
    for (const [id, rows] of Array.from(byId.entries()).sort()) {
      for (const r of rows) {
        const badge = r.status === 'passed' ? '✅'
          : r.status === 'failed' || r.status === 'timedOut' ? '❌'
          : r.status === 'skipped' ? '⏭️' : '⚠️';
        const evidence = r.attachments.length
          ? r.attachments.map((a) => `[link](${a})`).join('<br>')
          : '—';
        md.push(`| ${id} | ${r.role} | ${escapePipes(r.title)} | ${badge} ${r.status} | ${r.durationMs} | ${evidence} |`);
      }
    }
    const failures = this.rows.filter((r) => r.status === 'failed' || r.status === 'timedOut');
    if (failures.length) {
      md.push('');
      md.push('## Failure details');
      md.push('');
      for (const f of failures) {
        md.push(`### ${f.uatId} — ${f.title}`);
        md.push('');
        md.push('```');
        md.push(f.errors.join('\n---\n') || '(no error message)');
        md.push('```');
        md.push('');
      }
    }
    fs.writeFileSync(path.join(this.outDir, 'uat-execution-report.md'), md.join('\n'));
    fs.writeFileSync(
      path.join(this.outDir, 'uat-execution-report.json'),
      JSON.stringify({ summary: { total, passed, failed, skipped }, rows: this.rows }, null, 2),
    );

    // eslint-disable-next-line no-console
    console.log(`\n📄 UAT report → ${path.join(this.outDir, 'uat-execution-report.md')}`);
  }
}

function escapePipes(s: string) { return s.replace(/\|/g, '\\|'); }
