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

describe('assessment mode — site visit routing', () => {
  const inspection = {
    categories: ['FIRE', 'FLOOD'],
    thresholds: { FIRE: D(20_000), FLOOD: D(20_000) },
  };

  const fire: ModeInput = {
    category: 'FIRE',
    estimatedAmount: D(300_000),
    hasOpenFraudSignal: false,
    evidenceComplete: true,
    policy: { categories: [], limits: {} },
    inspection,
  };

  it('attends a large property loss instead of interviewing it', () => {
    // The defect this closes: every non-fast-tracked claim went to VIDEO, so a
    // RM300,000 fire was assessed over a video call.
    expect(resolveAssessmentMode(fire).mode).toBe('SITE_VISIT');
  });

  it('interviews a property loss below the threshold', () => {
    // Sending an adjuster costs more than the difference it makes down here.
    expect(resolveAssessmentMode({ ...fire, estimatedAmount: D(19_999.99) }).mode).toBe('VIDEO');
  });

  it('treats the threshold as inclusive', () => {
    expect(resolveAssessmentMode({ ...fire, estimatedAmount: D(20_000) }).mode).toBe('SITE_VISIT');
  });

  it('never attends a category the firm did not list', () => {
    // Travel is the case that matters: the loss happened overseas and there is
    // no risk address in Malaysia to attend.
    const travel = { ...fire, category: 'TRAVEL', estimatedAmount: D(400_000) };
    expect(resolveAssessmentMode(travel).mode).toBe('VIDEO');
  });

  it('does not route to a site visit without any policy', () => {
    // Absence means no automatic spend, matching the fast track. A firm that
    // has not set thresholds has not authorised the travel cost.
    const { inspection: _omitted, ...noPolicy } = fire;
    expect(resolveAssessmentMode(noPolicy).mode).toBe('VIDEO');
  });

  it('does not route to a site visit for a listed category with no threshold', () => {
    // Same reading as a fast-track category with no ceiling: a configuration
    // gap is refused rather than filled in.
    const gap = { ...fire, inspection: { categories: ['FIRE'], thresholds: {} } };
    expect(resolveAssessmentMode(gap).mode).toBe('VIDEO');
  });

  it('does not attend a claim with no estimated amount', () => {
    // The threshold cannot be tested, and guessing errs towards spending.
    expect(resolveAssessmentMode({ ...fire, estimatedAmount: null }).mode).toBe('VIDEO');
  });

  it('lets the fast track win where the firm configured both', () => {
    // Desk review is cheaper and its four conditions all held; reaching the
    // site-visit threshold must not override that.
    const both = {
      ...fire,
      estimatedAmount: D(25_000),
      policy: { categories: ['FIRE'], limits: { FIRE: D(50_000) } },
    };
    expect(resolveAssessmentMode(both).mode).toBe('DESK_REVIEW');
  });

  it('keeps medical ahead of the inspection test', () => {
    const medical = { ...fire, isMedical: true };
    expect(resolveAssessmentMode(medical).mode).toBe('EXPERT_REFERRAL');
  });

  it('says why it is attending, and why it is not desk-reviewing', () => {
    // A site visit is the most expensive method; PD 12.6 makes it exactly the
    // one whose basis a reader will want.
    const decision = resolveAssessmentMode({ ...fire, hasOpenFraudSignal: true });
    expect(decision.reasons).toContain(
      'An open fraud signal at MEDIUM or above requires more than a desk review'
    );
    expect(decision.reasons.some(r => /reaches the site-visit threshold of 20000.00/.test(r))).toBe(
      true
    );
    expect(decision.fastTracked).toBe(false);
  });
});
