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

  /**
   * People do not type the format the prompt asks for, and a claim should not
   * stall because of it. Every form below was rejected outright before.
   */
  describe('the way people actually write dates', () => {
    it('reads a month written in words, either order', () => {
      for (const text of ['16 June 2026', '16 Jun 2026', '16th June 2026', 'June 16, 2026']) {
        const iso = parseTextDate(text);
        expect(new Date(iso!).getUTCDate()).toBe(16);
        expect(new Date(iso!).getUTCMonth()).toBe(5);
      }
    });

    it('reads Malay month names', () => {
      // Half the country writes these, and the prompt is not going to stop them.
      expect(new Date(parseTextDate('16 Ogos 2026')!).getUTCMonth()).toBe(7); // August
      expect(new Date(parseTextDate('3 Mac 2026')!).getUTCMonth()).toBe(2); // March
    });

    it('reads a two-digit year as this century', () => {
      expect(new Date(parseTextDate('16/06/26')!).getUTCFullYear()).toBe(2026);
    });

    it('accepts spaces as separators', () => {
      // What a phone keyboard makes easiest.
      expect(new Date(parseTextDate('16 06 2026')!).getUTCDate()).toBe(16);
    });

    it('understands today and yesterday, in either language', () => {
      const now = new Date(Date.UTC(2026, 5, 16, 9, 30));
      expect(parseTextDate('today', 'date', now)).toBe('2026-06-16T00:00:00.000Z');
      expect(parseTextDate('yesterday', 'date', now)).toBe('2026-06-15T00:00:00.000Z');
      expect(parseTextDate('semalam', 'date', now)).toBe('2026-06-15T00:00:00.000Z');
    });

    it('refuses a relative day on a datetime step', () => {
      // "today" carries no clock reading, and inventing one would stamp a
      // made-up time on an incident record.
      expect(parseTextDate('today', 'datetime', new Date())).toBeNull();
    });

    it('still refuses a day that does not exist, however it is written', () => {
      expect(parseTextDate('31 February 2026')).toBeNull();
      expect(parseTextDate('31/02/26')).toBeNull();
    });

    it('keeps reading bare numeric dates day-first', () => {
      // The safety property the looser parsing must not cost: 06/07 is 6 July.
      const iso = parseTextDate('06/07/26');
      expect(new Date(iso!).getUTCDate()).toBe(6);
      expect(new Date(iso!).getUTCMonth()).toBe(6);
    });
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
