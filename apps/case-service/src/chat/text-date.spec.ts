import { parseTextDate, validateAnswer, type FlowStep } from '@tci/shared-types';

/**
 * DAY-FIRST DATE ENTRY on channels with no date control.
 *
 * The bug these pin: the bot asked for DD/MM/YYYY, the claimant sent exactly
 * that, and the shared validator rejected it — while silently accepting the
 * American reading of an ambiguous date, which is the dangerous half.
 */
describe('text date entry', () => {
  const step = (answerType: 'date' | 'datetime'): FlowStep => ({
    id: 'trip-start',
    prompt: 'When did your trip begin?',
    label: 'Trip start',
    answerType,
    next: { type: 'end' },
  });

  it('reads the format the prompt asks for', () => {
    const iso = parseTextDate('16/06/2026');
    expect(iso).not.toBeNull();
    expect(new Date(iso!).getUTCDate()).toBe(16);
    expect(new Date(iso!).getUTCMonth()).toBe(5); // June
  });

  it('reads an ambiguous date day-first, not month-first', () => {
    // The silent defect: new Date('06/07/2026') gives 7 June. A Malaysian
    // claimant means 6 July, and incident-date drives the CSP deadline flags.
    const iso = parseTextDate('06/07/2026');
    expect(new Date(iso!).getUTCDate()).toBe(6);
    expect(new Date(iso!).getUTCMonth()).toBe(6); // July
  });

  it('accepts dashes and dots as separators', () => {
    expect(parseTextDate('16-06-2026')).not.toBeNull();
    expect(parseTextDate('16.06.2026')).not.toBeNull();
  });

  it('passes ISO through untouched', () => {
    const iso = parseTextDate('2026-06-16');
    expect(new Date(iso!).getUTCDate()).toBe(16);
  });

  it('rejects a day that does not exist in that month', () => {
    // Date() rolls 31 February over to March; the round-trip check catches it.
    expect(parseTextDate('31/02/2026')).toBeNull();
    expect(parseTextDate('32/01/2026')).toBeNull();
    expect(parseTextDate('16/13/2026')).toBeNull();
  });

  it('parses a time for a datetime step', () => {
    const iso = parseTextDate('16/06/2026 14:30', 'datetime');
    expect(new Date(iso!).getUTCHours()).toBe(14);
    expect(new Date(iso!).getUTCMinutes()).toBe(30);
  });

  it('understands am/pm', () => {
    expect(new Date(parseTextDate('16/06/2026 2:30 pm', 'datetime')!).getUTCHours()).toBe(14);
    expect(new Date(parseTextDate('16/06/2026 12:30 am', 'datetime')!).getUTCHours()).toBe(0);
  });

  it('refuses a time on a plain date step', () => {
    expect(parseTextDate('16/06/2026 14:30', 'date')).toBeNull();
  });

  it('returns null rather than guessing at rubbish', () => {
    expect(parseTextDate('last tuesday')).toBeNull();
    expect(parseTextDate('')).toBeNull();
  });

  describe('shared validator', () => {
    it('accepts the ISO the parser produces', () => {
      const iso = parseTextDate('16/06/2026')!;
      expect(validateAnswer(step('date'), iso).valid).toBe(true);
    });

    it('refuses a slash date outright rather than reading it month-first', () => {
      // Previously "06/07/2026" passed as 7 June. Refusing is the safe answer:
      // text channels convert to ISO first, and every other caller already
      // sends ISO.
      const result = validateAnswer(step('date'), '06/07/2026');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DD/MM/YYYY');
    });
  });
});
