import { describe, expect, it } from 'vitest';
import { CASE_FLOWS, TravelClaimType, type CaseFlow, type FlowStep } from '@tci/shared-types';

import { CLAIM_TYPE_STEP_ID, SECTIONS, sectionOf, sectionsFor } from './sections';

/**
 * The section map is the one thing the form adds that the flow does not say.
 *
 * Everything else it draws comes from the server. So the failure this guards
 * against is specific: a step that lands in no section, or in two, disappears
 * from the form — and a question the claimant never sees is a claim they cannot
 * submit, on a form that looks complete while it is not. Nothing in the UI
 * would report it.
 */

const ALL_FLOWS = Object.values(CASE_FLOWS) as CaseFlow[];

describe('every step of every flow lands somewhere', () => {
  it('places each step in exactly one section', () => {
    for (const flow of ALL_FLOWS) {
      const { sections } = sectionsFor(flow, {});
      const placed = sections.flatMap(section => section.steps.map(step => step.id));

      expect(placed.sort()).toEqual(flow.steps.map(step => step.id).sort());
      expect(new Set(placed).size).toBe(placed.length);
    }
  });

  it('puts the review step last, and alone', () => {
    for (const flow of ALL_FLOWS) {
      const { sections } = sectionsFor(flow, {});
      const review = sections[sections.length - 1];

      expect(review.id).toBe('review');
      expect(review.steps.map(step => step.id)).toEqual(
        flow.steps.filter(step => step.isReview).map(step => step.id)
      );
    }
  });

  it('gathers every document into Evidence', () => {
    for (const flow of ALL_FLOWS) {
      const { sections } = sectionsFor(flow, {});
      const evidence = sections.find(section => section.id === 'evidence')!;
      const documents = flow.steps.filter(step => step.answerType === 'document');

      expect(evidence.steps.filter(step => step.answerType === 'document')).toEqual(documents);
    }
  });

  /**
   * A notice rather than a question, and it explains the uploads above it.
   * Anywhere else it would arrive without the thing it is about.
   */
  it('keeps the medical specialist notice with the medical evidence', () => {
    const flow = CASE_FLOWS[TravelClaimType.MEDICAL] as CaseFlow;
    const { sections } = sectionsFor(flow, {});
    const evidence = sections.find(section => section.id === 'evidence')!;

    expect(evidence.steps.map(step => step.id)).toContain('medical-review-note');
  });

  it('keeps the bank details together in Payout', () => {
    for (const flow of ALL_FLOWS) {
      const { sections } = sectionsFor(flow, {});
      const payout = sections.find(section => section.id === 'payout')!;

      expect(payout.steps.map(step => step.id)).toEqual([
        'bank-name',
        'bank-account-number',
        'bank-account-holder',
      ]);
    }
  });

  it('asks who and where before what happened', () => {
    const flow = CASE_FLOWS[TravelClaimType.FLIGHT_DELAY] as CaseFlow;
    const { sections } = sectionsFor(flow, {});
    const youTrip = sections.find(section => section.id === 'you-trip')!;

    expect(youTrip.steps.map(step => step.id)).toEqual([
      'claimant-name',
      'policy-number',
      'trip-start',
      'trip-end',
      'destination',
      'incident-date',
    ]);
  });
});

describe('a step the map has not heard of', () => {
  const unknown = (over: Partial<FlowStep> = {}): FlowStep =>
    ({ id: 'something-new', answerType: 'text', label: 'New', prompt: 'New?', ...over }) as FlowStep;

  /**
   * The fallback exists so an unrecognised step still renders. Vanishing is the
   * failure mode that cannot be noticed: the form would look finished and the
   * server would refuse to advance, with nothing on screen to explain why.
   */
  it('falls back to What happened rather than disappearing', () => {
    expect(sectionOf(unknown())).toBe('what-happened');
  });

  it('still routes an unknown document to Evidence, by its type', () => {
    expect(sectionOf(unknown({ answerType: 'document' }))).toBe('evidence');
  });

  it('still routes an unknown review step to Review, by its flag', () => {
    expect(sectionOf(unknown({ isReview: true }))).toBe('review');
  });

  it('places the pre-claim question, which belongs to no flow', () => {
    expect(sectionOf(unknown({ id: CLAIM_TYPE_STEP_ID }))).toBe('claim-type');
  });
});

describe('completeness and where a claimant lands', () => {
  const flow = CASE_FLOWS[TravelClaimType.FLIGHT_DELAY] as CaseFlow;
  const sectionNamed = (answers: Record<string, unknown>, id: string) =>
    sectionsFor(flow, answers as never).sections.find(section => section.id === id)!;

  const YOU_TRIP = {
    'claimant-name': 'Nur Aisyah',
    'trip-start': '2026-08-12',
    'trip-end': '2026-08-19',
    destination: 'JP',
    'incident-date': '2026-08-14T12:30:00Z',
  };

  it('sends a claimant with nothing answered to the first section', () => {
    expect(sectionsFor(flow, {}).firstIncomplete!.id).toBe('you-trip');
  });

  it('moves them on once a section is done', () => {
    expect(sectionsFor(flow, YOU_TRIP as never).firstIncomplete!.id).toBe('what-happened');
  });

  /**
   * `policy-number` is optional in every flow. A section that stayed grey
   * because somebody sensibly skipped it would send them hunting for a question
   * that was never required.
   */
  it('does not hold a section open for an unanswered optional step', () => {
    expect(sectionNamed(YOU_TRIP, 'you-trip').complete).toBe(true);
  });

  it('counts an answered optional step as answered, not as untouched', () => {
    const section = sectionNamed({ 'policy-number': 'TC-8827' }, 'you-trip');

    expect(section.untouched).toBe(false);
    expect(section.complete).toBe(false);
  });

  it('treats an empty string as unanswered — a cleared field is not an answer', () => {
    expect(sectionNamed({ ...YOU_TRIP, 'claimant-name': '' }, 'you-trip').complete).toBe(false);
  });

  /**
   * Review is finished by submitting, not by answering. Marking it complete
   * beforehand would tick the last box on a claim nobody had sent.
   */
  it('never marks Review complete, and never lands anyone there', () => {
    const everything = Object.fromEntries(flow.steps.map(step => [step.id, 'x']));
    const { sections, firstIncomplete } = sectionsFor(flow, everything as never);

    expect(sections.find(section => section.id === 'review')!.complete).toBe(false);
    expect(firstIncomplete).toBeNull();
  });

  it('returns the six sections in a fixed order', () => {
    expect(sectionsFor(flow, {}).sections.map(section => section.id)).toEqual(
      SECTIONS.map(section => section.id)
    );
  });
});
