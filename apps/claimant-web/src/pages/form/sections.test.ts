import { describe, expect, it } from 'vitest';
import {
  branchInputSteps,
  CASE_FLOWS,
  missingSteps,
  pathSteps,
  TravelClaimType,
  whatYouWillNeed,
  type CaseAnswers,
  type CaseFlow,
  type FlowStep,
} from '@tci/shared-types';

import { drawsTextBox } from './field-control';
import { missingRequired, stepsToSend } from './submit-engine';
import {
  CLAIM_TYPE_STEP_ID,
  SECTIONS,
  rowClassFor,
  rowsFor,
  sectionOf,
  sectionsFor,
} from './sections';

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
    // Asked of `sectionOf`, which is where the property lives: every step of
    // every flow must map to a section, whether or not a given claim's answers
    // lead through it. `sectionsFor` then shows the ones on the path — that is
    // a separate claim, tested below.
    for (const flow of ALL_FLOWS) {
      for (const step of flow.steps) {
        expect(SECTIONS.map(section => section.id)).toContain(sectionOf(step));
      }
    }
  });

  it('places every step it does show exactly once', () => {
    for (const flow of ALL_FLOWS) {
      const { sections } = sectionsFor(flow, {});
      const placed = sections.flatMap(section => section.steps.map(step => step.id));

      expect(new Set(placed).size).toBe(placed.length);
      for (const id of placed) {
        expect(flow.steps.map(step => step.id)).toContain(id);
      }
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
      // Every document step, on the path or not, belongs to Evidence…
      for (const step of flow.steps.filter(step => step.answerType === 'document')) {
        expect(sectionOf(step)).toBe('evidence');
      }

      // …and no document shown on this claim's path sits anywhere else.
      const { sections } = sectionsFor(flow, {});
      for (const section of sections.filter(section => section.id !== 'evidence')) {
        expect(section.steps.filter(step => step.answerType === 'document')).toEqual([]);
      }
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
/**
 * Pairs are a wide-screen affordance, and that is the whole rule.
 *
 * Two plain dates used to be excepted and stayed side by side at 390px, which
 * put trip start and trip end in a row while scheduled and actual departure —
 * a pair by the same reasoning — stacked under it. The seam was visible and
 * unexplainable: it tracked the field *type*, not what the fields meant. At
 * 153px a column the date only just fitted anyway, one locale format away from
 * the clipping that stacked the datetimes in the first place.
 */
describe('how a row lays out', () => {
  const step = (id: string, answerType: FlowStep['answerType']): FlowStep =>
    ({ id, label: id, prompt: id, answerType, next: { type: 'end' } }) as FlowStep;

  it('gives every pair the same columns, whatever the pair holds', () => {
    const dates = rowClassFor([step('trip-start', 'date'), step('trip-end', 'date')]);
    const times = rowClassFor([
      step('scheduled-departure', 'datetime'),
      step('actual-departure', 'datetime'),
    ]);

    expect(dates).toBe(times);
  });

  it('stacks a pair until there is room for two', () => {
    // `sm:` and no unprefixed `grid-cols-2`: full width on a phone, side by
    // side from 640px. The bug was an unprefixed one.
    const row = rowClassFor([step('trip-start', 'date'), step('trip-end', 'date')]);

    expect(row).toContain('sm:grid-cols-2');
    expect(row).not.toMatch(/(^|\s)grid-cols-2/);
  });

  it('leaves a lone field to arrange itself', () => {
    expect(rowClassFor([step('destination', 'choice')])).toBeUndefined();
  });

  it('pairs both halves of the trip and both departures, and nothing unrelated', () => {
    const steps = [
      step('claimant-name', 'text'),
      step('trip-start', 'date'),
      step('trip-end', 'date'),
      step('destination', 'choice'),
    ];

    expect(rowsFor(steps).map(row => row.map(field => field.id))).toEqual([
      ['claimant-name'],
      ['trip-start', 'trip-end'],
      ['destination'],
    ]);
  });

  it('leaves a half-pair full width when a branch drops the other', () => {
    const steps = [step('scheduled-departure', 'datetime')];

    expect(rowsFor(steps)).toEqual([[steps[0]]]);
    expect(rowClassFor(rowsFor(steps)[0])).toBeUndefined();
  });
});

/**
 * Placeholders are examples, never a second label.
 *
 * The failure they guard against is the common one: a box labelled "Full name"
 * with "Full name" greyed out inside it, which says nothing and vanishes the
 * moment somebody types. What they are for is the question a label cannot
 * answer — how much of a name, whether a flight number carries the airline code
 * — so every one has to be an example and none may echo its own label.
 */
describe('the examples the flow gives', () => {
  const steps = Object.values(CASE_FLOWS).flatMap(flow => flow.steps);

  it('gives the name field one, which is what a claimant hesitates over', () => {
    const name = steps.find(step => step.id === 'claimant-name')!;
    expect(name.placeholder).toBe('e.g. Nur Aisyah binti Rahman');
  });

  it('never repeats the label back', () => {
    for (const step of steps.filter(s => s.placeholder)) {
      expect(step.placeholder!.toLowerCase()).not.toBe(step.label.toLowerCase());
    }
  });

  it('puts them only where an empty box is drawn', () => {
    for (const step of steps.filter(s => s.placeholder)) {
      expect(drawsTextBox(step)).toBe(true);
    }
  });

  it('gives one to every field that can show one', () => {
    // Every input, on both surfaces. `drawsTextBox` is the control's own rule,
    // asked rather than copied — so a type that changes how it renders shows up
    // here instead of quietly leaving a field bare.
    const missing = [
      ...new Set(
        steps.filter(drawsTextBox).filter(step => !step.placeholder).map(step => step.id)
      ),
    ];

    expect(missing).toEqual([]);
  });

  it('agrees with itself across flows', () => {
    // `flight-number` and `baggage-tag` are defined once per flow that asks
    // them. Two spellings of one example is how the delay flow and the loss
    // flow start disagreeing about what a flight number looks like.
    const byId = new Map<string, Set<string>>();
    for (const step of steps.filter(s => s.placeholder)) {
      byId.set(step.id, (byId.get(step.id) ?? new Set()).add(step.placeholder!));
    }
    for (const [id, values] of byId) {
      expect(`${id}: ${[...values].join(' | ')}`).toBe(`${id}: ${[...values][0]}`);
    }
  });
});
/**
 * The form asks the questions this claim leads through, not every question in
 * the flow.
 *
 * A trip cancelled by a natural disaster used to be asked for a **medical
 * report**, marked Required, because the form laid out `flow.steps` whole while
 * the flow had branched correctly all along. The conversation honoured the
 * branch — it walks a step at a time — and the form did not, because it walked
 * a list.
 *
 * Worse than the odd question: that step is required and off the path, so the
 * server's `missingSteps` never asked for it while the form's guard always did.
 * An evidence section that could not be completed by uploading anything, on a
 * claim the server already considered ready.
 */
describe('a branch the claim did not take', () => {
  const cancellation = CASE_FLOWS[TravelClaimType.TRIP_CANCELLATION] as CaseFlow;

  const evidenceIds = (answers: Record<string, string>) =>
    sectionsFor(cancellation, answers)
      .sections.find(section => section.id === 'evidence')!
      .steps.map(step => step.id);

  it('does not ask a natural disaster for a medical report', () => {
    const shown = evidenceIds({ 'cancellation-reason': 'NATURAL_DISASTER' });

    expect(shown).not.toContain('doc-medical-report');
    expect(shown).toContain('doc-booking-invoice');
  });

  it('asks for one when the reason is illness', () => {
    expect(evidenceIds({ 'cancellation-reason': 'ILLNESS' })).toContain('doc-medical-report');
  });

  it('asks a death in the family for a death certificate, not a medical report', () => {
    // The bereavement arm used to share the illness step, so the evidence
    // screen asked a grieving claimant for the report from the hospital that
    // treated *them*. Relationship proof sits on the same arm but stays
    // optional, so it must appear without being demanded.
    const shown = evidenceIds({
      'cancellation-reason': 'DEATH_OF_RELATIVE',
      'death-certificate-issued': 'YES',
    });

    expect(shown).toContain('doc-death-certificate');
    expect(shown).toContain('doc-proof-of-relationship');
    expect(shown).not.toContain('doc-medical-report');
    expect(shown).not.toContain('doc-burial-permit');
  });

  it('swaps the certificate for the permit when JPN has not issued it', () => {
    const shown = evidenceIds({
      'cancellation-reason': 'DEATH_OF_RELATIVE',
      'death-certificate-issued': 'NO',
    });

    expect(shown).toContain('doc-burial-permit');
    expect(shown).not.toContain('doc-death-certificate');
  });

  it('does not put the bereavement evidence on the illness arm', () => {
    const shown = evidenceIds({ 'cancellation-reason': 'ILLNESS' });

    expect(shown).not.toContain('doc-death-certificate');
    expect(shown).not.toContain('doc-burial-permit');
    expect(shown).not.toContain('doc-proof-of-relationship');
  });

  it('completes a bereavement claim without the optional relationship proof', () => {
    // The whole point of leaving it optional: a sibling would need both birth
    // certificates, and the section must not be uncompletable while they hunt.
    const answers = {
      'cancellation-reason': 'DEATH_OF_RELATIVE',
      'death-certificate-issued': 'YES',
      'doc-death-certificate': 'doc-1',
      'doc-booking-invoice': 'doc-2',
      'doc-flight-itinerary': 'doc-3',
    };
    const evidence = sectionsFor(cancellation, answers).sections.find(
      section => section.id === 'evidence'
    )!;

    expect(evidence.complete).toBe(true);
  });

  it('drops it again when the reason is changed', () => {
    // The case the flow's own `pathSteps` docblock names: a claimant switches
    // from illness to a natural disaster, and the medical report stops being
    // part of the claim. What was uploaded is not deleted — it is simply no
    // longer presented.
    expect(evidenceIds({ 'cancellation-reason': 'ILLNESS' })).toContain('doc-medical-report');
    expect(evidenceIds({ 'cancellation-reason': 'NATURAL_DISASTER' })).not.toContain(
      'doc-medical-report'
    );
  });

  it('lets a natural-disaster claim complete its evidence', () => {
    // The form's own guard used to demand a document the server never asked
    // for, so the section could not be finished at all.
    const answers = {
      'cancellation-reason': 'NATURAL_DISASTER',
      'doc-booking-invoice': 'doc-1',
      'doc-flight-itinerary': 'doc-2',
    };
    const evidence = sectionsFor(cancellation, answers).sections.find(
      section => section.id === 'evidence'
    )!;

    expect(evidence.complete).toBe(true);
  });
});
/**
 * THE FORM ASKS WHAT THE CONVERSATION ASKS.
 *
 * Telegram, WhatsApp and the web chat walk the flow one step at a time through
 * `evaluateNext`, so they physically cannot ask a question the answers route
 * around. The form draws a whole section at once, which is the only way the two
 * can disagree — and they did: it laid out `flow.steps` whole, so a trip
 * cancelled by a natural disaster was asked for a medical report.
 *
 * This is the general form of that bug rather than the one instance. It holds
 * both form surfaces at once, because the claimant's form and the agent's share
 * this one `sectionsFor`.
 *
 * Every combination of every branch input is enumerated, so a branch added to
 * any flow later is covered the day it is published — with nobody having to
 * remember that the form needs telling.
 */
describe('the form asks what the conversation asks', () => {
  /** Every set of answers the branch inputs of a flow can produce. */
  const answerCombinations = (flow: CaseFlow): CaseAnswers[] => {
    const inputs = [...branchInputSteps(flow)]
      .map(id => flow.steps.find(step => step.id === id))
      .filter((step): step is FlowStep => Boolean(step));

    return inputs.reduce<CaseAnswers[]>(
      (combinations, step) => {
        // The unanswered case is kept as well: it is what the form draws before
        // the claimant has reached the question that decides the branch.
        const values = [undefined, ...(step.choices ?? []).map(choice => choice.value)];
        return combinations.flatMap(base =>
          values.map(value => (value === undefined ? base : { ...base, [step.id]: value }))
        );
      },
      [{}]
    );
  };

  for (const [type, flow] of Object.entries(CASE_FLOWS) as Array<[string, CaseFlow]>) {
    describe(type, () => {
      it('shows exactly the steps the flow leads through', () => {
        for (const answers of answerCombinations(flow)) {
          const shown = sectionsFor(flow, answers)
            .sections.flatMap(section => section.steps.map(step => step.id))
            .sort();

          expect({ answers, shown }).toEqual({
            answers,
            shown: [...pathSteps(flow, answers)].sort(),
          });
        }
      });

      it('leaves nothing open that the server would demand', () => {
        /*
          The two guards are separate implementations — `missingRequired` is the
          form's Continue check, `missingSteps` is the server's submit check —
          and they must not disagree in either direction.

          Not a plain equality, because the form settles some of them without
          asking: an untouched optional step is skipped explicitly, and a notice
          is acknowledged by continuing past it. So the question is what would
          still be open once a section has been continued — everything the form
          asks for, plus everything it sends on the claimant's behalf, has to
          cover everything the server wants, and ask for nothing the server does
          not.
        */
        for (const answers of answerCombinations(flow)) {
          const shown = sectionsFor(flow, answers).sections.flatMap(section => section.steps);
          const context = {
            currentStepId: null,
            values: {},
            answers,
            steps: shown,
            documents: [],
          };

          const asked = missingRequired(context).map(step => step.id);
          const sentAutomatically = stepsToSend(context).map(entry => entry.step.id);
          const handled = new Set([...asked, ...sentAutomatically]);

          const serverWants = missingSteps(flow, answers)
            .map(step => step.id)
            .filter(id => !answers[id]);

          expect({ answers, unhandled: serverWants.filter(id => !handled.has(id)) }).toEqual({
            answers,
            unhandled: [],
          });

          // …and nothing is asked for that the server would not want.
          const onPath = pathSteps(flow, answers);
          expect({ answers, strays: asked.filter(id => !onPath.has(id)) }).toEqual({
            answers,
            strays: [],
          });
        }
      });
    });
  }
});
/**
 * What a claimant is told to go and find.
 *
 * The chat says this the moment a claim type is chosen, and the form now says
 * it in the same place from the same function — so the two cannot promise
 * different documents. What it must never do is send somebody hunting for a
 * document their claim will not ask for: trip cancellation reaches a medical
 * report, a death certificate, or neither, and a flat list of all three sends
 * the person whose flight was cancelled by a typhoon looking for a death
 * certificate.
 */
describe('what you will need', () => {
  const cancellation = CASE_FLOWS[TravelClaimType.TRIP_CANCELLATION] as CaseFlow;

  it('marks a document that depends on an answer not yet given', () => {
    const needs = whatYouWillNeed(cancellation, {});

    expect(needs.some(need => /medical report \(only if it applies\)/i.test(need))).toBe(true);
    expect(needs.some(need => /death certificate \(only if it applies\)/i.test(need))).toBe(true);
    // The ones every cancellation asks for carry no caveat.
    expect(needs).toContain('booking invoices');
  });

  it('drops the caveat once the reason settles it', () => {
    const needs = whatYouWillNeed(cancellation, { 'cancellation-reason': 'ILLNESS' });

    expect(needs).toContain('medical report');
    expect(needs.some(need => /death certificate/i.test(need) && !/only if/i.test(need))).toBe(
      false
    );
  });

  it('promises nothing conditional on a flow that never branches', () => {
    const delay = CASE_FLOWS[TravelClaimType.FLIGHT_DELAY] as CaseFlow;

    expect(whatYouWillNeed(delay, {}).some(need => /only if it applies/.test(need))).toBe(false);
  });

  it('still names the policy number and the bank details', () => {
    const needs = whatYouWillNeed(cancellation, {});

    expect(needs[0]).toMatch(/policy number/i);
    expect(needs[needs.length - 1]).toMatch(/bank details/i);
  });
});
