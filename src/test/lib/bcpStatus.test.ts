import { describe, it, expect } from 'vitest';
import { deriveBcpStatus, isBiaComplete, canOverrideBcpStatus, canSignOffBcp } from '@/lib/bcpStatus';

const completeBia = {
  biaCriticalityRating: 'High',
  biaFinancialImpact: '1000',
  biaOperationalImpact: 'Severe',
  biaReputationalImpact: 'Moderate',
  biaRegulatoryImpact: 'Low',
  biaMaxTolerableDowntime: '24',
  biaAssessmentDate: '2026-08-01',
};

describe('bcpStatus derivation', () => {
  it('flags an incomplete BIA', () => {
    expect(isBiaComplete({ ...completeBia, biaRegulatoryImpact: '' })).toBe(false);
    expect(isBiaComplete(completeBia)).toBe(true);
  });

  it('holds in Needs Review when the BIA is incomplete', () => {
    const r = deriveBcpStatus({ ...completeBia, biaOperationalImpact: '', testStatus: 'Passed' });
    expect(r.status).toBe('Needs Review');
    expect(r.reason).toMatch(/impact assessment/i);
  });

  it('prioritises a failed test over everything else', () => {
    const r = deriveBcpStatus({ ...completeBia, testStatus: 'Failed', signedOffAt: '2026-08-02' });
    expect(r.status).toBe('Needs Review');
    expect(r.reason).toMatch(/failed/i);
  });

  it('marks the plan Outdated when the next test date has lapsed', () => {
    const r = deriveBcpStatus(
      { ...completeBia, testStatus: 'Passed', nextTestDate: '2026-07-01', signedOffAt: '2026-08-02' },
      new Date('2026-08-08'),
    );
    expect(r.status).toBe('Outdated');
  });

  it('requires sign-off before Ready', () => {
    const base = { ...completeBia, testStatus: 'Passed' as const, nextTestDate: '2026-12-01' };
    expect(deriveBcpStatus(base, new Date('2026-08-08')).status).toBe('Needs Review');
    expect(
      deriveBcpStatus({ ...base, signedOffAt: '2026-08-02' }, new Date('2026-08-08')).status,
    ).toBe('Ready');
  });

  it('requires a passed test before Ready', () => {
    const r = deriveBcpStatus(
      { ...completeBia, testStatus: 'Not Tested', signedOffAt: '2026-08-02' },
      new Date('2026-08-08'),
    );
    expect(r.status).toBe('Needs Review');
    expect(r.reason).toMatch(/passed test/i);
  });

  it('restricts override to ADMIN and CRO, sign-off to RMD/CRO/ADMIN', () => {
    expect(canOverrideBcpStatus('ADMIN')).toBe(true);
    expect(canOverrideBcpStatus('CRO')).toBe(true);
    expect(canOverrideBcpStatus('RMD')).toBe(false);
    expect(canSignOffBcp('RMD')).toBe(true);
    expect(canSignOffBcp('RO')).toBe(false);
  });
});
