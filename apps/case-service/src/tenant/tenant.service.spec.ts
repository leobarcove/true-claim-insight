import { TenantService } from './tenant.service';
import { TenantScope } from '../common/decorators/tenant.decorator';
import type { TenantContext } from '../common/guards/tenant.guard';

/**
 * COMPLIANCE TESTS — data minimisation and PII redaction.
 *
 * These assert controls the platform claims in docs/MASTER_PLAN.md §3, so a
 * regression here is a compliance regression, not just a bug:
 *
 *  - FSA Sch 7 / fair dealing: behavioural-analysis and fraud output is internal
 *    work product and must never be returned to a claimant.
 *  - PDPA: NRIC is masked for roles that have no need to see it, and masking
 *    must fail CLOSED on unexpected formats rather than passing the value through.
 *
 * redactClaim is a pure function, so no database is required — which is what
 * makes this suite viable in CI (§4.3 A4).
 */
describe('TenantService.redactClaim (compliance)', () => {
  // redactClaim never touches prisma; a stub keeps the unit isolated.
  const service = new TenantService({} as any);

  const context = (userRole: string): TenantContext => ({
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole,
    scope: TenantScope.STRICT,
    allowCrossTenant: false,
  });

  const claim = () => ({
    id: 'claim-1',
    nric: '880101-14-5555',
    status: 'UNDER_REVIEW',
    approvedAmount: 12500,
    sumInsured: 50000,
    // NRIC is encrypted at rest: the row carries ciphertext, a blind index and a
    // clear tail — never a plaintext NRIC.
    claimant: {
      id: 'c1',
      nricEncrypted: 'v1:aXY=:Y2lwaGVy:dGFn',
      nricHash: 'abc123',
      nricLast4: '5555',
      dateOfBirth: '1988-01-01',
      fullName: 'Kumar',
    },
    trinityChecks: [{ id: 't1', score: 42 }],
    fraudSignals: [{ id: 'f1', severity: 'HIGH' }],
    riskAssessments: [{ id: 'r1' }],
    deceptionData: [{ id: 'd1', deception: 71 }],
    summary: { deceptionScore: 0.71, isHighRisk: true, other: 'keep' },
    sessions: [
      {
        id: 's1',
        summary: { deceptionScore: 0.71, isHighRisk: true },
        deceptionScores: [{ id: 'ds1' }],
        riskAssessments: [{ id: 'ra1' }],
        screenshots: ['a.png'],
        clientInfos: [{ ipv4: '1.2.3.4' }],
        scheduledTime: '2026-08-01T00:00:00Z',
      },
    ],
    notes: [
      { id: 'n1', isPrivate: true, authorType: 'FIRM_ADMIN', content: 'internal' },
      { id: 'n2', isPrivate: false, authorType: 'ADJUSTER', content: 'visible' },
    ],
  });

  describe.each(['CLAIMANT', 'SUPPORT_DESK'])('for %s', role => {
    it('never exposes behavioural or fraud analysis', () => {
      const r = service.redactClaim(claim(), context(role));

      expect(r.deceptionData).toBeUndefined();
      expect(r.riskAssessments).toBeUndefined();
      expect(r.fraudSignals).toBeUndefined();
      expect(r.trinityChecks).toBeUndefined();
      expect(r.summary.deceptionScore).toBeUndefined();
      expect(r.summary.isHighRisk).toBeUndefined();
      // Non-sensitive summary content survives.
      expect(r.summary.other).toBe('keep');
    });

    it('strips per-session analysis while keeping the session itself', () => {
      const [session] = service.redactClaim(claim(), context(role)).sessions;

      expect(session.summary).toBeUndefined();
      expect(session.deceptionScores).toBeUndefined();
      expect(session.riskAssessments).toBeUndefined();
      expect(session.screenshots).toBeUndefined();
      expect(session.clientInfos).toBeUndefined();
      expect(session.scheduledTime).toBe('2026-08-01T00:00:00Z');
    });

    it('does not expose claim financials', () => {
      const r = service.redactClaim(claim(), context(role));

      expect(r.approvedAmount).toBeUndefined();
      expect(r.sumInsured).toBeUndefined();
    });
  });

  describe('NRIC protection (PDPA)', () => {
    it('never returns ciphertext or the blind index to any role', () => {
      for (const role of ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN', 'CLAIMANT', 'SUPPORT_DESK']) {
        const r = service.redactClaim(claim(), context(role));

        expect(r.claimant.nricEncrypted).toBeUndefined();
        expect(r.claimant.nricHash).toBeUndefined();
        expect(r.nricEncrypted).toBeUndefined();
        // The clear tail is what screens display.
        expect(r.claimant.nricLast4).toBe('5555');
      }
    });

    it('masks any legacy plaintext NRIC still in flight for low-privilege roles', () => {
      const legacy = { ...claim(), nric: '880101-14-5555' };
      const r = service.redactClaim(legacy, context('ADJUSTER'));

      expect(r.nric).toBe('********5555');
    });

    it('fails closed on a non-canonical NRIC rather than passing it through', () => {
      const input = { ...claim(), nric: '88010114 5555 extra' };
      const r = service.redactClaim(input, context('ADJUSTER'));

      expect(r.nric).not.toContain('88010114');
      expect(r.nric).toBe('************');
    });

    it('leaves a legacy plaintext NRIC intact for privileged investigative roles', () => {
      const legacy = { ...claim(), nric: '880101-14-5555' };
      for (const role of ['FIRM_ADMIN', 'SUPER_ADMIN', 'SIU_INVESTIGATOR']) {
        const r = service.redactClaim(legacy, context(role));
        expect(r.nric).toBe('880101-14-5555');
      }
    });
  });

  describe('private notes', () => {
    it('hides private notes from an adjuster and keeps public ones', () => {
      const notes = service.redactClaim(claim(), context('ADJUSTER')).notes;

      expect(notes.map((n: any) => n.id)).toEqual(['n2']);
    });
  });
});
