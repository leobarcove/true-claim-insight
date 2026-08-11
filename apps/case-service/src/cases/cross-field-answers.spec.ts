import {
  CASE_FLOWS,
  getFlow,
  getStep,
  validateAnswer,
  type CaseAnswers,
  type CaseFlow,
  type FlowStep,
} from '@tci/shared-types';
import { TravelClaimType } from '@prisma/client';

/**
 * Answers that are individually plausible and jointly impossible.
 *
 * Every field validated in isolation for as long as this flow existed, so a
 * trip that ended before it began, and an incident years outside the travel
 * window, both reached an adjuster as a clean claim. Neither needs
 * conversational understanding to catch — they are rules, and this is them.
 */
describe('cross-field answer validation', () => {
  const flow = (type: TravelClaimType): CaseFlow => getFlow(type);
  const step = (type: TravelClaimType, id: string): FlowStep => {
    const found = getStep(flow(type), id);
    if (!found) throw new Error(`no step ${id} in ${type}`);
    return found;
  };
  const check = (
    type: TravelClaimType,
    stepId: string,
    value: string,
    answers: CaseAnswers
  ) => validateAnswer(step(type, stepId), value, { answers, travelClaimType: type });

  describe('trip dates', () => {
    it('refuses a trip that ends before it starts', () => {
      const result = check(TravelClaimType.FLIGHT_DELAY, 'trip-end', '2026-08-05', {
        'trip-start': '2026-08-20',
      });
      expect(result.valid).toBe(false);
      // Quotes the other date back, so the claimant knows which one to fix.
      expect(result.error).toContain('20 August 2026');
    });

    it('catches the same contradiction from the other side', () => {
      // A claimant who types "back" and corrects the start date must hit the
      // rule too — otherwise the check is only as good as the order of entry.
      const result = check(TravelClaimType.FLIGHT_DELAY, 'trip-start', '2026-08-20', {
        'trip-end': '2026-08-05',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5 August 2026');
    });

    it('accepts a same-day trip', () => {
      expect(
        check(TravelClaimType.FLIGHT_DELAY, 'trip-end', '2026-08-05', {
          'trip-start': '2026-08-05',
        }).valid
      ).toBe(true);
    });

    it('says nothing when the other date is missing or skipped', () => {
      expect(check(TravelClaimType.FLIGHT_DELAY, 'trip-end', '2026-08-05', {}).valid).toBe(true);
      expect(
        check(TravelClaimType.FLIGHT_DELAY, 'trip-end', '2026-08-05', { 'trip-start': 'skip' })
          .valid
      ).toBe(true);
    });
  });

  describe('departure times', () => {
    it('refuses an actual departure before the scheduled one', () => {
      const result = check(
        TravelClaimType.FLIGHT_DELAY,
        'actual-departure',
        '2026-08-11T09:00:00Z',
        { 'scheduled-departure': '2026-08-11T15:00:00Z' }
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('left early');
    });

    it('accepts a delay, which is the whole point of the claim', () => {
      expect(
        check(TravelClaimType.FLIGHT_DELAY, 'actual-departure', '2026-08-11T15:00:00Z', {
          'scheduled-departure': '2026-08-11T09:00:00Z',
        }).valid
      ).toBe(true);
    });
  });

  describe('incident date against the trip', () => {
    // Deliberately in the past: `incident-date` carries `notFuture`, so a trip
    // window in the future is refused by the per-field rule before the
    // relative one is ever consulted — and the test would pass for the wrong
    // reason.
    const trip = { 'trip-start': '2026-07-01', 'trip-end': '2026-07-05' };

    it('refuses an incident before the trip began', () => {
      const result = check(
        TravelClaimType.LUGGAGE_LOSS,
        'incident-date',
        '2026-06-01T10:00:00Z',
        trip
      );
      expect(result.valid).toBe(false);
      // Points at the likelier explanation rather than just refusing.
      expect(result.error).toContain('cancellation');
    });

    it('refuses an incident after the trip ended', () => {
      expect(
        check(TravelClaimType.MEDICAL, 'incident-date', '2026-07-20T10:00:00Z', trip).valid
      ).toBe(false);
    });

    it('accepts an incident late on the final day', () => {
      // The rule compares calendar days: `trip-end` is a date and arrives at
      // T00:00Z, so an afternoon incident on the last day is inside the trip.
      // Comparing instants would reject a true answer.
      expect(
        check(TravelClaimType.MEDICAL, 'incident-date', '2026-07-05T23:30:00Z', trip).valid
      ).toBe(true);
    });

    it('lets a cancellation happen before the trip, because it must', () => {
      // The incident *is* the reason the trip did not happen. A blanket
      // "during the trip" rule would reject every cancellation claim.
      expect(
        check(
          TravelClaimType.TRIP_CANCELLATION,
          'incident-date',
          '2026-06-01T10:00:00Z',
          trip
        ).valid
      ).toBe(true);
    });

    it('refuses a cancellation dated after departure', () => {
      expect(
        check(
          TravelClaimType.TRIP_CANCELLATION,
          'incident-date',
          '2026-07-03T10:00:00Z',
          trip
        ).valid
      ).toBe(false);
    });
  });

  describe('ordering against the per-field rules', () => {
    it('answers a mistyped date with the format hint, not a contradiction', () => {
      // "06/07/2026" is refused as day-first ambiguity. If the relative rules
      // ran first they would parse it month-first and complain about the trip
      // window, sending the claimant to look for a mistake in another answer.
      const result = check(TravelClaimType.FLIGHT_DELAY, 'trip-end', '06/07/2026', {
        'trip-start': '2026-08-20',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DD/MM/YYYY');
    });

    it('still applies every per-field rule when no context is given', () => {
      expect(validateAnswer(step(TravelClaimType.FLIGHT_DELAY, 'trip-start'), 'not a date').valid)
        .toBe(false);
    });
  });

  describe('the claimant name step', () => {
    const nameStep = () => step(TravelClaimType.FLIGHT_DELAY, 'claimant-name');

    it('is the first thing asked', () => {
      expect(flow(TravelClaimType.FLIGHT_DELAY).entryStepId).toBe('claimant-name');
    });

    it('exists on every flow and is marked system', () => {
      for (const definition of Object.values(CASE_FLOWS) as CaseFlow[]) {
        const found = getStep(definition, 'claimant-name');
        expect(found?.system).toBe(true);
      }
    });

    it('accepts a two-letter surname', () => {
      expect(validateAnswer(nameStep(), 'Ng').valid).toBe(true);
    });

    it('accepts the Malaysian naming forms', () => {
      for (const name of [
        'Kumaran a/l Muthusamy',
        'Suria binti Yusof',
        'Muhammad Firdaus bin Ismail',
        "Nur A'isyah",
      ]) {
        expect(validateAnswer(nameStep(), name).valid).toBe(true);
      }
    });

    it('refuses a non-answer, and says so in terms that fit a name', () => {
      const result = validateAnswer(nameStep(), 'n/a');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('IC or passport');
      // The description wording would be nonsense here.
      expect(result.error).not.toContain('more detail');
    });
  });
});
