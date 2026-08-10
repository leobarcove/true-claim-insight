import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { UpdateTenantSettingsDto, CALENDAR_STATES } from './dto/update-settings.dto';
import { fastTrackPolicy, isLicensedMode, tenantSettings } from './tenant-settings';

/**
 * COMPLIANCE TESTS — per-tenant configuration (MASTER_PLAN §4.2).
 *
 * These settings gate regulated behaviour: whether a countersign blocks,
 * which calendar computes a CSP deadline, whether a claim may skip an
 * interview. What these hold:
 *
 *  - Every default fails **closed**. An absent setting must never enable a
 *    control the firm is not authorised to operate under, nor a shortcut it
 *    has not chosen.
 *  - Malformed input is refused at the boundary rather than coerced, because a
 *    silently-defaulted threshold decides how claims are examined.
 */

const validate = (payload: Record<string, unknown>) =>
  validateSync(plainToInstance(UpdateTenantSettingsDto, payload));

describe('tenant settings — defaults fail closed', () => {
  it('treats absent settings as unregistered', () => {
    // Claiming registered status the firm does not hold is the worse error.
    expect(isLicensedMode(undefined)).toBe(false);
    expect(isLicensedMode(null)).toBe(false);
    expect(isLicensedMode({})).toBe(false);
  });

  it('does not read licensedMode from a non-object', () => {
    expect(isLicensedMode('licensedMode')).toBe(false);
    expect(isLicensedMode([{ licensedMode: true }])).toBe(false);
  });

  it('returns no fast-track policy when none is configured', () => {
    const policy = fastTrackPolicy({});
    expect(policy.categories).toEqual([]);
    expect(policy.limits).toEqual({});
  });

  it('drops a malformed limit rather than defaulting it', () => {
    // A category left without a limit is refused by the router. Inventing a
    // ceiling on the firm's behalf would let claims skip interviews on a
    // threshold nobody chose.
    const policy = fastTrackPolicy({
      fastTrackCategories: ['TRAVEL'],
      fastTrackLimits: { TRAVEL: 'not-a-number' },
    });
    expect(policy.categories).toEqual(['TRAVEL']);
    expect(policy.limits.TRAVEL).toBeUndefined();
  });

  it('parses a well-formed limit as a decimal', () => {
    const policy = fastTrackPolicy({ fastTrackLimits: { TRAVEL: '5000.00' } });
    expect(policy.limits.TRAVEL.toFixed(2)).toBe('5000.00');
  });

  it('tolerates a settings column holding nonsense', () => {
    expect(tenantSettings('nonsense')).toEqual({});
    expect(tenantSettings(42)).toEqual({});
  });
});

describe('tenant settings — validation at the boundary', () => {
  it('accepts a well-formed patch', () => {
    expect(
      validate({
        licensedMode: true,
        calendarState: 'Selangor',
        fastTrackCategories: ['TRAVEL', 'FIRE'],
        fastTrackLimits: { TRAVEL: '5000.00' },
        reason: 'Registration granted',
      })
    ).toHaveLength(0);
  });

  it('rejects a calendar state the SLA engine does not know', () => {
    // Four states observe a Friday–Saturday weekend; a typo here silently
    // computes deadlines against the wrong one.
    const errors = validate({ calendarState: 'Selangorr' });
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors)).toMatch(/calendarState must be one of/);
  });

  it('lists the Friday-weekend states it knows about', () => {
    for (const state of ['Johor', 'Kedah', 'Kelantan', 'Terengganu']) {
      expect(CALENDAR_STATES).toContain(state);
    }
  });

  it('rejects a claim category that does not exist', () => {
    expect(validate({ fastTrackCategories: ['SPACESHIP'] })).not.toHaveLength(0);
  });

  it('rejects a fast-track limit that is not a decimal string', () => {
    // A JSON number is a float, and this ceiling turns on equality at the
    // boundary — 5000 exactly is inside the limit.
    expect(validate({ fastTrackLimits: { TRAVEL: 5000 } })).not.toHaveLength(0);
    expect(validate({ fastTrackLimits: { TRAVEL: '5,000.00' } })).not.toHaveLength(0);
    expect(validate({ fastTrackLimits: { TRAVEL: '5000.000' } })).not.toHaveLength(0);
  });

  it('rejects a limit keyed to an unknown category', () => {
    expect(validate({ fastTrackLimits: { SPACESHIP: '100.00' } })).not.toHaveLength(0);
  });

  it('accepts a limit with no decimal places', () => {
    expect(validate({ fastTrackLimits: { TRAVEL: '5000' } })).toHaveLength(0);
  });

  it('allows an empty patch — every field is optional', () => {
    expect(validate({})).toHaveLength(0);
  });
});
