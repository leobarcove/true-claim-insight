import { AdjusterReportStatus, AdjusterReportType } from '@prisma/client';
import {
  REPORT_STATUS_TRANSITIONS,
  canSign,
  canTransition,
  countersignDecision,
  type AdjusterStanding,
} from './report-authority';

/**
 * COMPLIANCE TESTS — BNM Adjuster PD 12.7 authorship and sign-off.
 *
 * PD 12.7 restricts reports to adjusting employees and requires a junior's report
 * to be signed by a senior. PD 12.6 requires the disclosures to be present. These
 * are the gates that decide whether the firm may put a report in front of an
 * insurer, so they are enforced as pure decisions and tested exhaustively.
 */
describe('Report authority (PD 12.7)', () => {
  const senior = (id = 'senior-1'): AdjusterStanding => ({ id, status: 'ACTIVE', yearsInSubject: 9 });
  const junior = (id = 'junior-1'): AdjusterStanding => ({ id, status: 'ACTIVE', yearsInSubject: 2 });
  /** No competency data — the situation today, before AdjusterCompetency exists. */
  const unknown = (id = 'unknown-1'): AdjusterStanding => ({ id, status: 'ACTIVE' });

  const signParams = (over: Partial<Parameters<typeof canSign>[0]> = {}) => ({
    type: AdjusterReportType.FINAL,
    author: senior(),
    signer: senior(),
    licensedMode: false,
    missingSections: [] as string[],
    ...over,
  });

  describe('lifecycle', () => {
    it('treats an issued report as immutable', () => {
      // A correction supersedes; it never edits. What the insurer was told, and
      // when, has to stay recoverable for a s.146 examination.
      expect(REPORT_STATUS_TRANSITIONS[AdjusterReportStatus.ISSUED]).toEqual([]);
      expect(canTransition(AdjusterReportStatus.ISSUED, AdjusterReportStatus.DRAFT)).toBe(false);
      expect(canTransition(AdjusterReportStatus.ISSUED, AdjusterReportStatus.WITHDRAWN)).toBe(false);
    });

    it('does not allow a draft to be issued without being signed', () => {
      expect(canTransition(AdjusterReportStatus.DRAFT, AdjusterReportStatus.ISSUED)).toBe(false);
      expect(canTransition(AdjusterReportStatus.DRAFT, AdjusterReportStatus.SIGNED)).toBe(false);
      expect(canTransition(AdjusterReportStatus.IN_REVIEW, AdjusterReportStatus.ISSUED)).toBe(false);
    });

    it('allows a reviewer to send a submitted report back for correction', () => {
      expect(canTransition(AdjusterReportStatus.IN_REVIEW, AdjusterReportStatus.DRAFT)).toBe(true);
    });

    it('permits only the intended route to issue', () => {
      expect(canTransition(AdjusterReportStatus.DRAFT, AdjusterReportStatus.IN_REVIEW)).toBe(true);
      expect(canTransition(AdjusterReportStatus.IN_REVIEW, AdjusterReportStatus.SIGNED)).toBe(true);
      expect(canTransition(AdjusterReportStatus.SIGNED, AdjusterReportStatus.ISSUED)).toBe(true);
    });

    it('leaves withdrawn terminal', () => {
      expect(REPORT_STATUS_TRANSITIONS[AdjusterReportStatus.WITHDRAWN]).toEqual([]);
    });
  });

  describe('countersign (PD 12.4(a) / 12.7(b))', () => {
    it('does not require a countersign for a senior author', () => {
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: senior(),
        signer: senior(),
        licensedMode: true,
      });

      expect(decision.required).toBe(false);
      expect(decision.satisfied).toBe(true);
      expect(decision.basis).toMatch(/senior per PD 12\.4/i);
    });

    it('requires a senior countersign for a junior author', () => {
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: junior(),
        signer: senior(),
        licensedMode: true,
      });

      expect(decision.required).toBe(true);
      expect(decision.satisfied).toBe(true);
    });

    it('is not satisfied by a junior signing their own report', () => {
      const author = junior();
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author,
        signer: author,
        licensedMode: true,
      });

      expect(decision.satisfied).toBe(false);
    });

    it('is not satisfied by a second junior', () => {
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: junior('j1'),
        signer: junior('j2'),
        licensedMode: true,
      });

      expect(decision.satisfied).toBe(false);
    });

    it('assumes junior when seniority is unknown, which is the safe default', () => {
      // Wrongly requiring a countersign costs a signature. Wrongly waiving one
      // issues an unsupervised junior's report over the firm's name.
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: unknown('a'),
        signer: unknown('a'),
        licensedMode: true,
      });

      expect(decision.required).toBe(true);
      expect(decision.satisfied).toBe(false);
      expect(decision.basis).toMatch(/unknown/i);
    });

    it('records the basis in every case, so a signature is never silently assumed', () => {
      for (const author of [senior(), junior(), unknown()]) {
        const decision = countersignDecision({
          type: AdjusterReportType.FINAL,
          author,
          signer: senior('other'),
          licensedMode: false,
        });
        expect(decision.basis.trim().length).toBeGreaterThan(10);
      }
    });
  });

  describe('supervision and recognition (PD 12.3 / 12.4)', () => {
    it('requires a countersign for an author in the supervision year, whatever their experience', () => {
      // A ten-year veteran newly hired is still 12.3-new: the firm has not yet
      // seen their work, which is the point of the supervision.
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: { id: 'vet', status: 'ACTIVE', yearsInSubject: 10, underSupervision: true },
        signer: senior(),
        licensedMode: true,
      });

      expect(decision.required).toBe(true);
      expect(decision.basis).toMatch(/12\.3/);
    });

    it('does not count five unrecognised years as a senior countersigner', () => {
      // 12.4 makes senior a recognition: volume and performance are the firm's
      // judgement, not arithmetic's. When the model has an answer, it governs.
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: junior(),
        signer: { id: 's', status: 'ACTIVE', yearsInSubject: 8, seniorRecognised: false },
        licensedMode: true,
      });

      expect(decision.satisfied).toBe(false);
    });

    it('accepts a recognised senior as the countersigner', () => {
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: junior(),
        signer: { id: 's', status: 'ACTIVE', yearsInSubject: 6, seniorRecognised: true },
        licensedMode: true,
      });

      expect(decision.satisfied).toBe(true);
    });

    it('falls back to years only when the competency model has no record', () => {
      // Pre-model records: seniorRecognised undefined. The fallback keeps old
      // behaviour rather than retroactively invalidating past sign-offs.
      const decision = countersignDecision({
        type: AdjusterReportType.FINAL,
        author: junior(),
        signer: { id: 's', status: 'ACTIVE', yearsInSubject: 8 },
        licensedMode: true,
      });

      expect(decision.satisfied).toBe(true);
    });
  });

  describe('the licence flip', () => {
    // §1: the regulated machinery ships now and runs inert as a TPA, becoming a
    // hard gate on registration. These two tests are that promise, verified.
    const unmetCountersign = { author: unknown('a'), signer: unknown('a') };

    it('records but allows an unmet countersign while unlicensed', () => {
      expect(canSign(signParams({ ...unmetCountersign, licensedMode: false })).allowed).toBe(true);
    });

    it('blocks the same report once licensedMode is on', () => {
      const result = canSign(signParams({ ...unmetCountersign, licensedMode: true }));

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/countersign/i);
    });
  });

  describe('signing eligibility', () => {
    it('refuses a suspended adjuster in any mode', () => {
      for (const licensedMode of [false, true]) {
        const result = canSign(
          signParams({ signer: { id: 's', status: 'SUSPENDED', yearsInSubject: 9 }, licensedMode })
        );

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/SUSPENDED/);
      }
    });

    it('refuses while PD 12.6 sections are empty, licensed or not', () => {
      for (const licensedMode of [false, true]) {
        const result = canSign(signParams({ missingSections: ['methodology', 'sources'], licensedMode }));

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/methodology/);
        expect(result.reason).toMatch(/PD 12\.6/);
      }
    });

    it('allows a complete report signed by an active senior adjuster', () => {
      expect(canSign(signParams({ licensedMode: true })).allowed).toBe(true);
    });
  });
});
