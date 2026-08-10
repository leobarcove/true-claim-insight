import { anonymiseClaimant, canAnonymise, isAnonymisedPhone } from './anonymisation-rules';

/**
 * COMPLIANCE TESTS — claimant anonymisation (PD 12.8 + PDPA s.10(2)).
 *
 * Two obligations pull opposite ways and both must hold: PD 12.8 wants the
 * adjusting record for seven years, PDPA wants personal data gone once its
 * purpose ends. Anonymisation satisfies both — keep what the firm did, stop
 * holding who it was done to.
 *
 * What these guard:
 *  - **Irreversibility.** A reversible transform is pseudonymisation and PDPA
 *    still applies to it. Replacements must be random, never derived.
 *  - **Every re-identification vector goes**, not only the obvious ones — the
 *    blind index and the NRIC tail are stronger than the name.
 *  - **One open or held claim keeps the whole person.**
 *  - **A missing policy never shortens retention.**
 */

const closed = (yearsAgo: number) => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date;
};

describe('anonymisation — what is destroyed', () => {
  const result = anonymiseClaimant();

  it('destroys the NRIC blind index', () => {
    // The strongest vector in the schema: an HMAC survives the plaintext being
    // destroyed and matches any future NRIC put through the same pepper.
    expect(result.nricHash).toBeNull();
  });

  it('destroys the NRIC ciphertext', () => {
    // Ciphertext is personal data while we also hold the key.
    expect(result.nricEncrypted).toBeNull();
  });

  it('destroys the NRIC tail', () => {
    // Four digits with a date of birth usually identifies one person.
    expect(result.nricLast4).toBeNull();
  });

  it('destroys name, birth date and email', () => {
    expect(result.fullName).toBeNull();
    expect(result.dateOfBirth).toBeNull();
    expect(result.email).toBeNull();
  });

  it('stamps when it happened', () => {
    expect(result.anonymisedAt).toBeInstanceOf(Date);
  });
});

describe('anonymisation — irreversibility', () => {
  it('replaces the phone number rather than nulling it', () => {
    // The column is required and unique, and is the natural key intake
    // resolves a claimant by. Nulling it would break the row.
    const result = anonymiseClaimant();
    expect(typeof result.phoneNumber).toBe('string');
    expect(isAnonymisedPhone(result.phoneNumber)).toBe(true);
  });

  it('produces a different token every time', () => {
    // Derived tokens are the trap: hashing a Malaysian mobile is reversible by
    // brute force over a few hundred million candidates, which is minutes.
    const tokens = new Set(Array.from({ length: 200 }, () => anonymiseClaimant().phoneNumber));
    expect(tokens.size).toBe(200);
  });

  it('carries nothing of the number it replaced', () => {
    const token = anonymiseClaimant().phoneNumber;
    expect(token).not.toMatch(/60\d{8,}/);
    expect(token).toMatch(/^anonymised:[0-9a-f-]{36}$/);
  });
});

describe('anonymisation — eligibility', () => {
  const retainYears = 7;
  const now = new Date();

  it('anonymises when every claim closed beyond the retention period', () => {
    const decision = canAnonymise({
      claims: [{ closedAt: closed(9), legalHoldAt: null }],
      retainYears,
      now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.basis).toMatch(/retention elapsed/);
  });

  it('refuses while any claim is under legal hold', () => {
    // Checked before the arithmetic: a hold outranks the calendar entirely.
    const decision = canAnonymise({
      claims: [{ closedAt: closed(20), legalHoldAt: new Date() }],
      retainYears,
      now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toMatch(/legal hold/i);
  });

  it('refuses while any claim is still open', () => {
    const decision = canAnonymise({
      claims: [{ closedAt: closed(20), legalHoldAt: null }, { closedAt: null, legalHoldAt: null }],
      retainYears,
      now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toMatch(/still open/);
  });

  it('measures from the most recent closure, not the oldest', () => {
    // A person with a ten-year-old settled claim and one closed last year is
    // still within retention. Measuring from the oldest would destroy identity
    // the recent claim's record still depends on.
    const decision = canAnonymise({
      claims: [{ closedAt: closed(12), legalHoldAt: null }, { closedAt: closed(1), legalHoldAt: null }],
      retainYears,
      now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toMatch(/most recent closure/);
  });

  it('never shortens retention below the PD 12.8 floor', () => {
    // A policy row saying two years cannot override the statutory seven.
    const decision = canAnonymise({
      claims: [{ closedAt: closed(3), legalHoldAt: null }],
      retainYears: 2,
      now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toMatch(/7 years/);
  });

  it('honours a policy longer than the floor', () => {
    const decision = canAnonymise({
      claims: [{ closedAt: closed(8), legalHoldAt: null }],
      retainYears: 10,
      now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toMatch(/10 years/);
  });

  it('refuses a claimant with no claims rather than guessing', () => {
    const decision = canAnonymise({ claims: [], retainYears, now });
    expect(decision.allowed).toBe(false);
    expect(decision.basis).toMatch(/cannot be established/);
  });
});
