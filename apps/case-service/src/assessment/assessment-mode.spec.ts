import { Prisma } from '@prisma/client';

import {
  AssessmentMode,
  escalateMode,
  describeMode,
  MODE_LADDER,
  ModeInput,
  resolveAssessmentMode,
} from './assessment-mode';

const D = (value: string | number) => new Prisma.Decimal(value);

/**
 * COMPLIANCE TESTS — assessment-mode router (MASTER_PLAN §2.4).
 *
 * The mode is a disclosable method under PD 12.6, so what these hold is not
 * only the routing but the *reasons*: a decision that cannot say why it was
 * made is not disclosable, whatever it decided.
 *
 * Guarded here:
 *  - All four fast-track conditions are necessary, each tested alone.
 *  - Medical never desk-reviews, whatever the amount.
 *  - Missing configuration means no fast track, not an unlimited one.
 *  - Escalation moves one level, and stops at the top rather than
 *    manufacturing a change nobody decided.
 */

const policy = {
  categories: ['TRAVEL', 'FIRE'],
  limits: { TRAVEL: D(5_000), FIRE: D(50_000) },
};

const eligible: ModeInput = {
  category: 'TRAVEL',
  estimatedAmount: D(3_000),
  hasOpenFraudSignal: false,
  evidenceComplete: true,
  policy,
};

describe('assessment mode — the fast track needs all four conditions', () => {
  it('desk-reviews when every condition holds', () => {
    const decision = resolveAssessmentMode(eligible);
    expect(decision.mode).toBe('DESK_REVIEW');
    expect(decision.fastTracked).toBe(true);
    expect(decision.reasons).toHaveLength(3);
  });

  it('refuses on a category the firm does not fast-track', () => {
    const decision = resolveAssessmentMode({ ...eligible, category: 'LIABILITY' });
    expect(decision.mode).toBe('VIDEO');
    expect(decision.reasons.join(' ')).toMatch(/not on the firm's fast-track list/);
  });

  it('refuses above the category limit', () => {
    const decision = resolveAssessmentMode({ ...eligible, estimatedAmount: D(5_000.01) });
    expect(decision.fastTracked).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/exceeds the fast-track limit/);
  });

  it('accepts exactly at the limit — the ceiling is inclusive', () => {
    const decision = resolveAssessmentMode({ ...eligible, estimatedAmount: D(5_000) });
    expect(decision.mode).toBe('DESK_REVIEW');
  });

  it('refuses on an open fraud signal', () => {
    const decision = resolveAssessmentMode({ ...eligible, hasOpenFraudSignal: true });
    expect(decision.fastTracked).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/fraud signal/i);
  });

  it('refuses on an incomplete evidence checklist', () => {
    const decision = resolveAssessmentMode({ ...eligible, evidenceComplete: false });
    expect(decision.fastTracked).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/checklist is incomplete/);
  });

  it('gives every failing reason, not just the first', () => {
    // An adjuster resolving one blocker should not discover the next one only
    // after fixing it.
    const decision = resolveAssessmentMode({
      ...eligible,
      estimatedAmount: D(9_000),
      hasOpenFraudSignal: true,
      evidenceComplete: false,
    });
    expect(decision.reasons).toHaveLength(3);
  });
});

describe('assessment mode — configuration gaps fail closed', () => {
  it('does not fast-track a listed category with no limit configured', () => {
    const decision = resolveAssessmentMode({
      ...eligible,
      policy: { categories: ['TRAVEL'], limits: {} },
    });
    expect(decision.fastTracked).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/No fast-track limit is configured/);
  });

  it('does not fast-track when the amount is unknown', () => {
    // Unknown is not "small". Testing a ceiling against nothing would pass by
    // accident.
    const decision = resolveAssessmentMode({ ...eligible, estimatedAmount: null });
    expect(decision.fastTracked).toBe(false);
    expect(decision.reasons.join(' ')).toMatch(/cannot be tested/);
  });

  it('fast-tracks nothing when the firm has configured no categories', () => {
    const decision = resolveAssessmentMode({
      ...eligible,
      policy: { categories: [], limits: {} },
    });
    expect(decision.mode).toBe('VIDEO');
  });
});

describe('assessment mode — medical is never desk-reviewed', () => {
  it('refers medical to an expert regardless of amount', () => {
    const decision = resolveAssessmentMode({ ...eligible, estimatedAmount: D(1), isMedical: true });
    expect(decision.mode).toBe('EXPERT_REFERRAL');
    expect(decision.fastTracked).toBe(false);
  });

  it('checks medical before the economic tests, so a tiny claim cannot slip through', () => {
    const decision = resolveAssessmentMode({
      ...eligible,
      isMedical: true,
      hasOpenFraudSignal: false,
      evidenceComplete: true,
    });
    expect(decision.mode).toBe('EXPERT_REFERRAL');
    expect(decision.reasons.join(' ')).toMatch(/never desk-reviewed/);
  });
});

describe('assessment mode — escalation', () => {
  it('moves exactly one level', () => {
    expect(escalateMode('DESK_REVIEW', 'FRAUD_SIGNAL').mode).toBe('VIDEO');
    expect(escalateMode('VIDEO', 'AMOUNT_REVISED_UP').mode).toBe('SITE_VISIT');
    expect(escalateMode('SITE_VISIT', 'EXTRACTION_INCONSISTENCY').mode).toBe('EXPERT_REFERRAL');
  });

  it('does not skip the cheaper step a fraud signal might have resolved', () => {
    // §2.5's COGS ceiling is what makes attempting the cheap step first worth
    // it; jumping to a site visit spends the budget the ladder exists to protect.
    expect(escalateMode('DESK_REVIEW', 'FRAUD_SIGNAL').mode).not.toBe('SITE_VISIT');
  });

  it('stops at the top rather than reporting a change nobody made', () => {
    const decision = escalateMode('EXPERT_REFERRAL', 'FRAUD_SIGNAL');
    expect(decision.mode).toBe('EXPERT_REFERRAL');
    expect(decision.changed).toBe(false);
  });

  it('names the trigger in the reason', () => {
    expect(escalateMode('DESK_REVIEW', 'AMOUNT_REVISED_UP').reasons.join(' ')).toMatch(
      /revised upward/
    );
  });

  it('orders the ladder cheapest first', () => {
    expect(MODE_LADDER).toEqual(['DESK_REVIEW', 'VIDEO', 'SITE_VISIT', 'EXPERT_REFERRAL']);
  });
});

describe('assessment mode — PD 12.6 disclosure', () => {
  it.each(MODE_LADDER)('describes %s as a method with its basis', mode => {
    const prose = describeMode(mode as AssessmentMode, ['A reason']);
    expect(prose).toMatch(/Assessed by|Referred to/);
    expect(prose).toContain('Basis for this level of assessment:');
    expect(prose).toContain('A reason');
  });

  it('carries the router reasons verbatim into the disclosure', () => {
    const decision = resolveAssessmentMode({ ...eligible, evidenceComplete: false });
    const prose = describeMode(decision.mode, decision.reasons);
    for (const reason of decision.reasons) expect(prose).toContain(reason);
  });
});
